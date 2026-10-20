import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { ExecutorActionSchema } from "@/agents/schemas/execution-result";
import type { ExecutorAction } from "@/agents/schemas/execution-result";
import { buildExecutorPrompt } from "@/agents/prompts/executor-prompt";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";
import { parseLlmJson } from "@/lib/utils/json-parse";

// The executor's per-action LLM decision: prompt -> parsed ExecutorAction.

export interface BillingInfo {
  workspaceId: string;
  projectId: string;
  runId?: string;
}

function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)])
    );
  }
  return obj;
}

const VALID_VERDICTS = new Set(["pass", "fail", "environment_error"]);

function normalizeAction(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.verdict && !VALID_VERDICTS.has(raw.verdict as string)) {
    const original = raw.verdict;
    raw = { ...raw, verdict: "fail", reason: raw.reason ?? `Non-standard verdict: ${original}` };
  }
  return raw;
}

const LLM_MAX_RETRIES = 3;
const LLM_BASE_DELAY_MS = 2000;
const RETRYABLE_PATTERNS = ["rate_limit", "timeout", "overloaded", "ECONNRESET", "529"];

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

export async function getNextAction(
  context: ExecutorContext,
  billing: BillingInfo
): Promise<ExecutorAction> {
  const model = await getModelForTask("browser_execution");
  const prompt = buildExecutorPrompt(context);

  for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      const result = await createTrackedCompletion(
        {
          model,
          systemPrompt: prompt,
          messages: [{ role: "user", content: "Decide the next action." }],
          maxTokens: 500,
          temperature: 0,
        },
        {
          workspaceId: billing.workspaceId,
          projectId: billing.projectId,
          runId: billing.runId,
          agentPhase: "executor",
        }
      );

      const cleaned = stripNulls(parseLlmJson(result.content)) as Record<string, unknown>;
      return ExecutorActionSchema.parse(normalizeAction(cleaned));
    } catch (err) {
      if (!isRetryableError(err) || attempt === LLM_MAX_RETRIES) {
        throw err;
      }
      const delay = LLM_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[StepExecutor] LLM call attempt ${attempt}/${LLM_MAX_RETRIES} failed (${msg}) — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error("[StepExecutor] getNextAction exhausted retries");
}
