import { createAnthropicCompletion, streamAnthropicCompletion } from "@/lib/ai/providers/anthropic";
import { createOpenAICompletion, createEmbedding, createEmbeddings } from "@/lib/ai/providers/openai";
import {
  createOpenRouterCompletion,
  streamOpenRouterCompletion,
} from "@/lib/ai/providers/openrouter";

export const MODELS = {
  HAIKU: "claude-haiku-4-5-20251001",
  SONNET: "claude-sonnet-4-6",
  OPUS: "claude-opus-4-6",
  GPT_5_2: "gpt-5.2",
  GPT_4_1: "gpt-4.1",
  O4_MINI: "o4-mini",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];

interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

interface CompletionOptions {
  model: string;
  systemPrompt: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
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

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude");
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt") || model.startsWith("o4-") || model.startsWith("o3-");
}

export async function createCompletion(
  options: CompletionOptions
): Promise<CompletionResult> {
  const { model, apiKey } = options;

  if (isAnthropicModel(model)) {
    return createAnthropicCompletion(options);
  }

  if (isOpenAIModel(model)) {
    return createOpenAICompletion(options);
  }

  // Route all other models through OpenRouter
  return createOpenRouterCompletion({ ...options, apiKey });
}

export async function* streamCompletion(
  options: CompletionOptions
): AsyncGenerator<string, CompletionResult> {
  const { model, apiKey } = options;

  if (isAnthropicModel(model)) {
    return yield* streamAnthropicCompletion(options);
  }

  // OpenAI streaming not needed for current agent use cases.
  // Fall back to non-streaming and yield the full content.
  if (isOpenAIModel(model)) {
    const result = await createOpenAICompletion(options);
    yield result.content;
    return result;
  }

  // Route all other models through OpenRouter streaming
  return yield* streamOpenRouterCompletion({ ...options, apiKey });
}

export { createEmbedding, createEmbeddings };
