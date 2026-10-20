// The only caller of AI providers. Every call goes through the same pipeline:
// run budget check -> per-workspace token bucket -> provider resolution -> spend
// reservation -> provider call with retries -> spend settlement + usage accounting.

import { BudgetExceededError, ProviderError } from "@/server/ai/errors";
import { costOf, getCosts } from "@/server/ai/pricing";
import { getEmbeddingProvider, resolveProvider } from "@/server/ai/providers";
import { currentRunBudget } from "@/server/ai/run-budget";
import { reserveSpend, settleSpend, type Reservation } from "@/server/ai/spend";
import { acquire } from "@/server/ai/token-bucket";
import { recordUsage } from "@/server/ai/usage";
import { meterModelCall } from "@/server/ai/model-meter";
import type {
  CallContext,
  ChatProvider,
  ChatRequest,
  ChatResult,
  ToolChatRequest,
  ToolStreamEvent,
  Usage,
} from "@/server/ai/types";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const IMAGE_TOKENS = 1600;
const DEFAULT_MAX_TOKENS = 4096;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(err: ProviderError, attempt: number): number {
  const exp = BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.max(err.retryAfterMs ?? 0, exp + Math.random() * exp * 0.1);
}

/** Run fn, retrying retryable provider errors with exponential backoff. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, wait: (ms: number) => Promise<void> = sleep): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ProviderError) || !err.retryable || attempt >= MAX_ATTEMPTS) throw err;
      const delay = backoffMs(err, attempt);
      console.warn(`[AI] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message}); retrying in ${Math.round(delay)}ms`);
      await wait(delay);
    }
  }
}

function estimateInputTokens(req: ChatRequest): number {
  let chars = typeof req.system === "string" ? req.system.length : req.system.reduce((n, p) => n + p.text.length, 0);
  let images = 0;
  for (const m of req.messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
      continue;
    }
    for (const p of m.content) {
      if (p.type === "image") images++;
      else chars += JSON.stringify(p).length;
    }
  }
  return Math.ceil(chars / 4) + images * IMAGE_TOKENS;
}

interface Admitted {
  provider: ChatProvider;
  req: ChatRequest;
  reservation: Reservation | null;
}

async function admit<R extends ChatRequest>(req: R, ctx: CallContext): Promise<Admitted & { req: R }> {
  const runBudget = currentRunBudget();
  if (runBudget?.isOverBudget()) {
    const used = runBudget.getUsage();
    throw new BudgetExceededError(
      "run",
      `Run token budget exceeded (${used.inputTokens.toLocaleString()} input / ${used.outputTokens.toLocaleString()} output tokens). Increase maxTokenBudget or reduce the system map size.`
    );
  }
  await acquire(ctx.workspaceId);
  const { provider, apiKey } = await resolveProvider(req.model, ctx.workspaceId, req.apiKey);
  const worstCase = costOf(await getCosts(req.model), {
    inputTokens: estimateInputTokens(req),
    outputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });
  const reservation = await reserveSpend(ctx.workspaceId, worstCase);
  return { provider, req: { ...req, apiKey }, reservation };
}

async function account(ctx: CallContext, model: string, usage: Usage, reservation: Reservation | null): Promise<void> {
  const cost = costOf(await getCosts(model), usage);
  meterModelCall(cost);
  currentRunBudget()?.record(usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, ctx.agentPhase);
  await settleSpend(reservation, cost).catch((err) => console.error("[AI] Spend settlement failed:", err));
  // Recording must not block or fail the caller.
  recordUsage(ctx, model, usage, cost).catch((err) => console.error("[AI] Usage recording failed:", err));
}

async function release(reservation: Reservation | null): Promise<void> {
  await settleSpend(reservation, 0).catch((err) => console.error("[AI] Spend release failed:", err));
}

export async function complete(request: ChatRequest, ctx: CallContext): Promise<ChatResult> {
  const { provider, req, reservation } = await admit(request, ctx);
  try {
    const result = await withRetry(`${provider.name}:${req.model}`, () => provider.complete(req));
    await account(ctx, req.model, result.usage, reservation);
    return result;
  } catch (err) {
    await release(reservation);
    throw err;
  }
}

export async function* stream(request: ChatRequest, ctx: CallContext): AsyncGenerator<string, ChatResult> {
  const { provider, req, reservation } = await admit(request, ctx);
  try {
    // Only the connection is retried: once text has been yielded a retry would duplicate it.
    let gen = provider.stream(req);
    let next = await withRetry(`${provider.name}:${req.model}`, () => {
      gen = provider.stream(req);
      return gen.next();
    });
    while (!next.done) {
      yield next.value;
      next = await gen.next();
    }
    await account(ctx, req.model, next.value.usage, reservation);
    return next.value;
  } catch (err) {
    await release(reservation);
    throw err;
  }
}

export async function* streamWithTools(request: ToolChatRequest, ctx: CallContext): AsyncGenerator<ToolStreamEvent> {
  const { provider, req, reservation } = await admit(request, ctx);
  if (!provider.streamWithTools) {
    await release(reservation);
    throw new ProviderError(provider.name, `Tool use is not supported on the ${provider.name} provider`, { retryable: false });
  }
  const run = provider.streamWithTools.bind(provider);
  let pending = reservation;
  try {
    for await (const event of run(req)) {
      if (event.type === "message_complete") {
        await account(ctx, event.model, event.usage, pending);
        pending = null;
      }
      yield event;
    }
  } catch (err) {
    await release(pending);
    throw err;
  }
}

export interface Embeddings {
  vectors: number[][];
  provider: string;
  model: string;
}

/** Embed texts with the configured provider; null in keyword-only mode (ORBIT_EMBEDDINGS=none). */
export async function embed(texts: string[], workspaceId = "system"): Promise<Embeddings | null> {
  const provider = getEmbeddingProvider();
  if (!provider) return null;
  if (texts.length === 0) return { vectors: [], provider: provider.name, model: provider.model };
  await acquire(workspaceId);
  const vectors = await withRetry(`${provider.name}:${provider.model}`, () => provider.embed(texts));
  return { vectors, provider: provider.name, model: provider.model };
}
