import { prisma } from "@/lib/db";

interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenRouterCompletionOptions {
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

interface OpenRouterModel {
  modelId: string;
  displayName: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  capabilities: Record<string, boolean>;
}

const API_BASE = "https://openrouter.ai/api/v1";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(providedKey?: string): string {
  const key = providedKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OpenRouter API key not provided and OPENROUTER_API_KEY environment variable is not set"
    );
  }
  return key;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://useorbit.dev",
    "X-Title": "Orbit Testing Platform",
  };
}

function isRateLimitResponse(status: number): boolean {
  return status === 429;
}

export async function createOpenRouterCompletion(
  options: OpenRouterCompletionOptions
): Promise<CompletionResult> {
  const {
    model,
    systemPrompt,
    messages,
    maxTokens = 4096,
    temperature = 0,
    apiKey: providedKey,
  } = options;
  const apiKey = getApiKey(providedKey);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ],
        }),
      });

      if (isRateLimitResponse(response.status)) {
        if (attempt < MAX_RETRIES - 1) {
          const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * backoff * 0.1;
          await delay(backoff + jitter);
          continue;
        }
        throw new Error(
          `OpenRouter rate limit exceeded after ${MAX_RETRIES} attempts`
        );
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `OpenRouter API error (${response.status}): ${errorBody}`
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error("No completion choice returned from OpenRouter");
      }

      return {
        content: choice.message?.content ?? "",
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        model: data.model ?? model,
        stopReason: choice.finish_reason ?? null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on rate limits; throw immediately on other errors
      const isRetryable =
        lastError.message.includes("rate limit") ||
        lastError.message.includes("429");
      if (!isRetryable) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("OpenRouter completion failed after retries");
}

export async function* streamOpenRouterCompletion(
  options: OpenRouterCompletionOptions
): AsyncGenerator<string, CompletionResult> {
  const {
    model,
    systemPrompt,
    messages,
    maxTokens = 4096,
    temperature = 0,
    apiKey: providedKey,
  } = options;
  const apiKey = getApiKey(providedKey);

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter streaming error (${response.status}): ${errorBody}`
    );
  }

  if (!response.body) {
    throw new Error("OpenRouter returned no response body for stream");
  }

  let fullContent = "";
  let usageData = { inputTokens: 0, outputTokens: 0 };
  let responseModel = model;
  let stopReason: string | null = null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6);
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            fullContent += delta.content;
            yield delta.content;
          }

          if (parsed.choices?.[0]?.finish_reason) {
            stopReason = parsed.choices[0].finish_reason;
          }

          if (parsed.usage) {
            usageData = {
              inputTokens: parsed.usage.prompt_tokens ?? 0,
              outputTokens: parsed.usage.completion_tokens ?? 0,
            };
          }

          if (parsed.model) {
            responseModel = parsed.model;
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    usage: usageData,
    model: responseModel,
    stopReason,
  };
}

export async function discoverOpenRouterModels(
  apiKey?: string
): Promise<OpenRouterModel[]> {
  const key = getApiKey(apiKey);

  const response = await fetch(`${API_BASE}/models`, {
    headers: buildHeaders(key),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter models API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const models: OpenRouterModel[] = [];

  for (const m of data.data ?? []) {
    models.push({
      modelId: m.id ?? "",
      displayName: m.name ?? m.id ?? "",
      contextWindow: m.context_length ?? 0,
      inputCostPer1M: parseFloat(m.pricing?.prompt ?? "0") * 1_000_000,
      outputCostPer1M: parseFloat(m.pricing?.completion ?? "0") * 1_000_000,
      capabilities: {
        chat: true,
        streaming: true,
        functionCalling: Boolean(m.supported_parameters?.includes("tools")),
        vision: Boolean(m.architecture?.modality?.includes("image")),
      },
    });
  }

  return models;
}

export async function syncModelsToRegistry(
  apiKey?: string
): Promise<number> {
  const models = await discoverOpenRouterModels(apiKey);
  let upsertCount = 0;

  for (const m of models) {
    await prisma.modelRegistry.upsert({
      where: {
        model_registry_unique: {
          provider: "openrouter",
          modelId: m.modelId,
        },
      },
      create: {
        provider: "openrouter",
        modelId: m.modelId,
        displayName: m.displayName,
        contextWindow: m.contextWindow,
        inputCostPer1M: m.inputCostPer1M,
        outputCostPer1M: m.outputCostPer1M,
        capabilities: m.capabilities,
        isActive: true,
        lastSyncedAt: new Date(),
      },
      update: {
        displayName: m.displayName,
        contextWindow: m.contextWindow,
        inputCostPer1M: m.inputCostPer1M,
        outputCostPer1M: m.outputCostPer1M,
        capabilities: m.capabilities,
        lastSyncedAt: new Date(),
      },
    });
    upsertCount++;
  }

  return upsertCount;
}
