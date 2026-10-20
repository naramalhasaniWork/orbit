// Embedding providers, selected by ORBIT_EMBEDDINGS=openai|voyage|ollama|none.
// ORBIT_EMBEDDINGS_MODEL overrides the default model of the chosen provider.

import { ProviderError, parseRetryAfter } from "@/server/ai/errors";
import type { EmbeddingProvider } from "@/server/ai/types";

export type EmbeddingMode = "openai" | "voyage" | "ollama" | "none";

const MODES = new Set<EmbeddingMode>(["openai", "voyage", "ollama", "none"]);

interface HttpEmbedder {
  name: string;
  url: string;
  batchSize: number;
  apiKey?: string;
  body: (model: string, input: string[]) => Record<string, unknown>;
  parse: (json: unknown) => number[][];
}

async function postJson(e: HttpEmbedder, body: Record<string, unknown>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(e.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(e.apiKey ? { Authorization: `Bearer ${e.apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError(e.name, `${e.name} embeddings request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(e.name, `${e.name} embeddings error (${res.status}): ${text.slice(0, 300)}`, {
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers?.get?.("retry-after")),
    });
  }
  return res.json();
}

function httpProvider(e: HttpEmbedder, model: string): EmbeddingProvider {
  return {
    name: e.name,
    model,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += e.batchSize) {
        out.push(...e.parse(await postJson(e, e.body(model, texts.slice(i, i + e.batchSize)))));
      }
      return out;
    },
  };
}

interface IndexedEmbedding {
  index: number;
  embedding: number[];
}

const byIndex = (json: unknown): number[][] =>
  ((json as { data?: IndexedEmbedding[] }).data ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);

function requireKey(name: string, envVar: string, env: NodeJS.ProcessEnv): string {
  const key = env[envVar]?.trim();
  if (!key) throw new ProviderError(name, `ORBIT_EMBEDDINGS=${name} requires ${envVar}`, { retryable: false });
  return key;
}

export function getEmbeddingMode(env: NodeJS.ProcessEnv = process.env): EmbeddingMode {
  const raw = env.ORBIT_EMBEDDINGS?.trim().toLowerCase();
  if (raw && MODES.has(raw as EmbeddingMode)) return raw as EmbeddingMode;
  // Unset: keep the historical behaviour (OpenAI) when a key exists, otherwise keyword search.
  return env.OPENAI_API_KEY?.trim() ? "openai" : "none";
}

/** The configured provider, or null in keyword-only ("none") mode. */
export function getEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider | null {
  const mode = getEmbeddingMode(env);
  const override = env.ORBIT_EMBEDDINGS_MODEL?.trim();

  switch (mode) {
    case "none":
      return null;
    case "openai":
      return httpProvider({
        name: "openai",
        url: "https://api.openai.com/v1/embeddings",
        batchSize: 100,
        apiKey: requireKey("openai", "OPENAI_API_KEY", env),
        body: (model, input) => ({ model, input }),
        parse: byIndex,
      }, override || "text-embedding-3-small");
    case "voyage":
      return httpProvider({
        name: "voyage",
        url: "https://api.voyageai.com/v1/embeddings",
        batchSize: 128,
        apiKey: requireKey("voyage", "VOYAGE_API_KEY", env),
        body: (model, input) => ({ model, input }),
        parse: byIndex,
      }, override || "voyage-3.5");
    case "ollama": {
      const base = (env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434").replace(/\/$/, "");
      return httpProvider({
        name: "ollama",
        url: `${base}/api/embed`,
        batchSize: 64,
        body: (model, input) => ({ model, input }),
        parse: (json) => (json as { embeddings?: number[][] }).embeddings ?? [],
      }, override || "nomic-embed-text");
    }
  }
}
