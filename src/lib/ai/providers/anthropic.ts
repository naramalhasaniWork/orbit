import Anthropic from "@anthropic-ai/sdk";

interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicCompletionOptions {
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

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function getClient(providedKey?: string): Anthropic {
  const apiKey = providedKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createAnthropicCompletion(
  options: AnthropicCompletionOptions
): Promise<CompletionResult> {
  const {
    model,
    systemPrompt,
    messages,
    maxTokens = 4096,
    temperature = 0,
    apiKey,
  } = options;
  const client = getClient(apiKey);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock ? textBlock.text : "";

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRateLimit =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Anthropic.APIError && error.status === 429);

      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * backoff * 0.1;
        await delay(backoff + jitter);
        continue;
      }

      if (!isRateLimit) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Anthropic completion failed after retries");
}

export async function* streamAnthropicCompletion(
  options: AnthropicCompletionOptions
): AsyncGenerator<string, CompletionResult> {
  const {
    model,
    systemPrompt,
    messages,
    maxTokens = 4096,
    temperature = 0,
    apiKey,
  } = options;
  const client = getClient(apiKey);

  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  let fullContent = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullContent += event.delta.text;
      yield event.delta.text;
    }
  }

  const finalMessage = await stream.finalMessage();

  return {
    content: fullContent,
    usage: {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    },
    model: finalMessage.model,
    stopReason: finalMessage.stop_reason,
  };
}
