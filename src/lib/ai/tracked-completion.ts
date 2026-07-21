import { createCompletion, streamCompletion } from "@/lib/ai";
import { recordTokenUsage } from "@/lib/billing/token-tracker";
import { getProviderForModel, getWorkspaceApiKey } from "@/lib/ai/model-router";

interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

interface TrackedCompletionOptions {
  model: string;
  systemPrompt: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
}

interface BillingContext {
  workspaceId: string;
  projectId?: string;
  runId?: string;
  agentPhase: "analyst" | "planner" | "executor" | "reporter" | "auditor";
}

interface CompletionResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  stopReason: string | null;
}

/**
 * Resolve the API key for a model: explicit option first, then the
 * workspace's own provider key (BYOK). Providers fall back to platform
 * env keys when this returns undefined.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveApiKey(
  model: string,
  workspaceId: string,
  provided?: string
): Promise<string | undefined> {
  if (provided) return provided;
  // Internal callers use pseudo-workspace ids like "system" — no BYOK row
  if (!UUID_RE.test(workspaceId)) return undefined;
  try {
    const provider = await getProviderForModel(model);
    return (await getWorkspaceApiKey(workspaceId, provider)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create a completion and automatically track token usage for billing.
 * Use this instead of createCompletion when billing context is available.
 */
export async function createTrackedCompletion(
  options: TrackedCompletionOptions,
  billing: BillingContext
): Promise<CompletionResult> {
  const apiKey = await resolveApiKey(
    options.model,
    billing.workspaceId,
    options.apiKey
  );
  const result = await createCompletion({ ...options, apiKey });

  // Fire and forget — token tracking should not block the response
  recordTokenUsage({
    workspaceId: billing.workspaceId,
    projectId: billing.projectId,
    runId: billing.runId,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: 0,
    agentPhase: billing.agentPhase,
  }).catch((err) => {
    console.error("[TokenTracker] Failed to record usage:", err);
  });

  return result;
}

/**
 * Stream a completion and automatically track token usage when done.
 */
export async function* streamTrackedCompletion(
  options: TrackedCompletionOptions,
  billing: BillingContext
): AsyncGenerator<string, CompletionResult> {
  const apiKey = await resolveApiKey(
    options.model,
    billing.workspaceId,
    options.apiKey
  );
  const gen = streamCompletion({ ...options, apiKey });

  let result: CompletionResult | undefined;

  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    yield next.value;
  }

  if (!result) {
    throw new Error("Stream completed without result");
  }

  // Track usage after stream completes
  recordTokenUsage({
    workspaceId: billing.workspaceId,
    projectId: billing.projectId,
    runId: billing.runId,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: 0,
    agentPhase: billing.agentPhase,
  }).catch((err) => {
    console.error("[TokenTracker] Failed to record usage:", err);
  });

  return result;
}

export type { BillingContext, TrackedCompletionOptions };
