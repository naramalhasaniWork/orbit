// One implementation of the OpenAI chat-completions protocol, shared by OpenAI itself,
// OpenRouter and any operator- or workspace-supplied compatible endpoint.

import { ProviderError, parseRetryAfter } from "@/server/ai/errors";
import { getModelSpec } from "@/server/ai/model-catalog";
import type { ChatMessage, ChatProvider, ChatRequest, ChatResult, Usage } from "@/server/ai/types";

export interface CompatibleEndpoint {
  name: string;
  baseUrl: string;
  /** Env var holding the platform key; a request's apiKey wins over it. */
  apiKeyEnv?: string;
  /** Keyless endpoints (e.g. a local Ollama) are allowed. */
  apiKeyOptional?: boolean;
  headers?: Record<string, string>;
}

interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

type WirePart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function toWireMessage(m: ChatMessage): { role: string; content: string | WirePart[] } {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  const parts = m.content.map((p): WirePart => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image") return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } };
    throw new ProviderError("openai-compatible", `Content type ${p.type} is not supported on this provider`, { retryable: false });
  });
  return { role: m.role, content: parts };
}

function toUsage(u: WireUsage | undefined): Usage {
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    cacheReadTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheCreationTokens: 0,
  };
}

export function buildCompatibleBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
  const system = typeof req.system === "string" ? req.system : req.system.map((p) => p.text).join("\n\n");
  const spec = getModelSpec(req.model);
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    messages: [{ role: "system", content: system }, ...req.messages.map(toWireMessage)],
  };
  if (req.temperature !== undefined && (spec?.acceptsSampling ?? true)) body.temperature = req.temperature;
  if (stream) body.stream = true;
  return body;
}

export function createCompatibleProvider(endpoint: CompatibleEndpoint): ChatProvider {
  const { name } = endpoint;

  function headers(apiKey?: string): Record<string, string> {
    const key = apiKey ?? (endpoint.apiKeyEnv ? process.env[endpoint.apiKeyEnv] : undefined);
    if (!key && !endpoint.apiKeyOptional) {
      throw new ProviderError(name, `No ${name} API key: set ${endpoint.apiKeyEnv ?? "a key"} or add a workspace key`, { retryable: false });
    }
    return {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...endpoint.headers,
    };
  }

  async function post(req: ChatRequest, stream: boolean): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: headers(req.apiKey),
        body: JSON.stringify(buildCompatibleBody(req, stream)),
      });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(name, `${name} request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderError(name, `${name} API error (${response.status}): ${body.slice(0, 500)}`, {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers?.get?.("retry-after")),
      });
    }
    return response;
  }

  async function complete(req: ChatRequest): Promise<ChatResult> {
    const data = (await (await post(req, false)).json()) as {
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
      usage?: WireUsage;
      model?: string;
    };
    const choice = data.choices?.[0];
    if (!choice) throw new ProviderError(name, `No completion choice returned from ${name}`, { retryable: false });
    return {
      content: choice.message?.content ?? "",
      usage: toUsage(data.usage),
      model: data.model ?? req.model,
      stopReason: choice.finish_reason ?? null,
    };
  }

  async function* stream(req: ChatRequest): AsyncGenerator<string, ChatResult> {
    const response = await post(req, true);
    if (!response.body) throw new ProviderError(name, `${name} returned no response body for stream`);

    let content = "";
    let usage = toUsage(undefined);
    let model = req.model;
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
        buffer = lines.pop() ?? ""; // keep a partial line for the next chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          let parsed: { choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>; usage?: WireUsage; model?: string };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // skip malformed SSE lines
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            yield delta;
          }
          if (parsed.choices?.[0]?.finish_reason) stopReason = parsed.choices[0].finish_reason;
          if (parsed.usage) usage = toUsage(parsed.usage);
          if (parsed.model) model = parsed.model;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return { content, usage, model, stopReason };
  }

  return { name, complete, stream };
}

export const openaiProvider = createCompatibleProvider({
  name: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKeyEnv: "OPENAI_API_KEY",
});

export const openrouterProvider = createCompatibleProvider({
  name: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeyEnv: "OPENROUTER_API_KEY",
  headers: { "HTTP-Referer": "https://useorbit.dev", "X-Title": "Orbit Testing Platform" },
});
