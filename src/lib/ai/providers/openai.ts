import OpenAI from "openai";

interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenAICompletionOptions {
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
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 100;

function getClient(providedKey?: string): OpenAI {
  const apiKey = providedKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof OpenAI.RateLimitError) return true;
  if (error instanceof OpenAI.APIError && error.status === 429) return true;
  return false;
}

export async function createOpenAICompletion(
  options: OpenAICompletionOptions
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
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No completion choice returned from OpenAI");
      }

      return {
        content: choice.message.content ?? "",
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
        stopReason: choice.finish_reason,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRateLimitError(error) && attempt < MAX_RETRIES - 1) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * backoff * 0.1;
        await delay(backoff + jitter);
        continue;
      }

      if (!isRateLimitError(error)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("OpenAI completion failed after retries");
}

export async function createEmbedding(text: string): Promise<number[]> {
  const client = getClient();

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("No embedding returned from OpenAI");
  }

  return embedding;
}

export async function createEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    const sorted = response.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      results.push(item.embedding);
    }
  }

  return results;
}
