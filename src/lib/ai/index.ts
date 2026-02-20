import { createAnthropicCompletion, streamAnthropicCompletion } from "@/lib/ai/providers/anthropic";
import { createOpenAICompletion, createEmbedding, createEmbeddings } from "@/lib/ai/providers/openai";

export const MODELS = {
  HAIKU: "claude-3-5-haiku-20241022",
  SONNET: "claude-sonnet-4-20250514",
  OPUS: "claude-opus-4-20250514",
  GPT4O: "gpt-4o",
  GPT4O_MINI: "gpt-4o-mini",
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
  return model.startsWith("gpt");
}

export async function createCompletion(
  options: CompletionOptions
): Promise<CompletionResult> {
  const { model } = options;

  if (isAnthropicModel(model)) {
    return createAnthropicCompletion(options);
  }

  if (isOpenAIModel(model)) {
    return createOpenAICompletion(options);
  }

  throw new Error(
    `Unknown model provider for model "${model}". Models must start with "claude" or "gpt".`
  );
}

export async function* streamCompletion(
  options: CompletionOptions
): AsyncGenerator<string, CompletionResult> {
  const { model } = options;

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

  throw new Error(
    `Unknown model provider for model "${model}". Models must start with "claude" or "gpt".`
  );
}

export { createEmbedding, createEmbeddings };
