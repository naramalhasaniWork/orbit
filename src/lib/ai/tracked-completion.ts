// Text-in/text-out completions for agent services. Thin adapter over the AI gateway,
// which owns provider selection, BYOK keys, retries, budgets and usage accounting.

import { complete, stream } from "@/server/ai/gateway";
import type { AgentPhase, ChatResult } from "@/server/ai/types";

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
  agentPhase: AgentPhase;
}

function toRequest(options: TrackedCompletionOptions) {
  return {
    model: options.model,
    system: options.systemPrompt,
    messages: options.messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    apiKey: options.apiKey,
  };
}

export function createTrackedCompletion(
  options: TrackedCompletionOptions,
  billing: BillingContext
): Promise<ChatResult> {
  return complete(toRequest(options), billing);
}

export function streamTrackedCompletion(
  options: TrackedCompletionOptions,
  billing: BillingContext
): AsyncGenerator<string, ChatResult> {
  return stream(toRequest(options), billing);
}

export type { BillingContext, TrackedCompletionOptions };
