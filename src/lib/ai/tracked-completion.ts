import { createCompletion, streamCompletion } from "@/lib/ai";
import { recordTokenUsage } from "@/lib/billing/token-tracker";

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
}

interface BillingContext {
  workspaceId: string;
  projectId?: string;
  runId?: string;
  agentPhase: "analyst" | "planner" | "executor" | "reporter";
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
 * Create a completion and automatically track token usage for billing.
 * Use this instead of createCompletion when billing context is available.
 */
export async function createTrackedCompletion(
  options: TrackedCompletionOptions,
  billing: BillingContext
): Promise<CompletionResult> {
  const result = await createCompletion(options);

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
  const gen = streamCompletion(options);

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
