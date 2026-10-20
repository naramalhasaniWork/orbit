import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { prismaMock, fetchMock } = vi.hoisted(() => ({
  prismaMock: {
    modelRegistry: { findFirst: vi.fn() },
    providerConfig: { findUnique: vi.fn() },
  },
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/vault", () => ({ decrypt: (enc: string) => `key-for-${enc}` }));

import { resolveProvider, getEmbeddingProvider, getEmbeddingMode, configuredEnvProviders } from "@/server/ai/providers";
import { UnsafeUrlError } from "@/lib/utils/ssrf";

const WS = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() };
}

beforeEach(() => {
  prismaMock.modelRegistry.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.providerConfig.findUnique.mockReset().mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock.mockReset());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("chat provider registry", () => {
  it("routes by model id and prefers the workspace's own key", async () => {
    prismaMock.providerConfig.findUnique.mockResolvedValue({ apiKeyEncrypted: "iv:abc", baseUrl: null, isActive: true });
    const resolved = await resolveProvider("claude-sonnet-5-5", WS);
    expect(resolved.provider.name).toBe("anthropic");
    expect(resolved.apiKey).toBe("key-for-abc");
    expect(prismaMock.providerConfig.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider_config_unique: { workspaceId: WS, provider: "anthropic" } } })
    );
  });

  it("sends unknown models to OpenRouter and gpt models to OpenAI", async () => {
    expect((await resolveProvider("mistral/mistral-large", "system")).provider.name).toBe("openrouter");
    expect((await resolveProvider("gpt-4.1", "system")).provider.name).toBe("openai");
  });

  it("rejects a private OpenAI-compatible base URL unless private targets are allowed", async () => {
    prismaMock.modelRegistry.findFirst.mockResolvedValue({ provider: "custom" });
    prismaMock.providerConfig.findUnique.mockResolvedValue({ apiKeyEncrypted: null, baseUrl: "http://10.0.0.5:8000/v1", isActive: true });

    await expect(resolveProvider("llama3", WS)).rejects.toBeInstanceOf(UnsafeUrlError);

    vi.stubEnv("ORBIT_ALLOW_PRIVATE_TARGETS", "true");
    const resolved = await resolveProvider("llama3", WS);
    expect(resolved.provider.name).toBe("openai-compatible");

    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    await resolved.provider.complete({ model: "llama3", system: "s", messages: [{ role: "user", content: "x" }] });
    expect(fetchMock.mock.calls[0][0]).toBe("http://10.0.0.5:8000/v1/chat/completions");
  });

  it("counts any configured chat provider", () => {
    expect(configuredEnvProviders({})).toEqual([]);
    expect(configuredEnvProviders({ OPENROUTER_API_KEY: "k", ORBIT_OPENAI_COMPATIBLE_BASE_URL: "http://x" })).toEqual([
      "openrouter",
      "openai-compatible",
    ]);
  });
});

describe("embedding provider selection", () => {
  it("defaults to OpenAI when a key exists, otherwise keyword-only", () => {
    expect(getEmbeddingMode({ OPENAI_API_KEY: "sk" })).toBe("openai");
    expect(getEmbeddingMode({})).toBe("none");
    expect(getEmbeddingProvider({ ORBIT_EMBEDDINGS: "none", OPENAI_API_KEY: "sk" })).toBeNull();
  });

  it("voyage posts batches and returns vectors in input order", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }));
    const provider = getEmbeddingProvider({ ORBIT_EMBEDDINGS: "voyage", VOYAGE_API_KEY: "vk" });

    expect(provider?.model).toBe("voyage-3.5");
    expect(await provider?.embed(["a", "b"])).toEqual([[1], [2]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(init.headers.Authorization).toBe("Bearer vk");
  });

  it("ollama needs no key and honours OLLAMA_BASE_URL and ORBIT_EMBEDDINGS_MODEL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ embeddings: [[0.1, 0.2]] }));
    const provider = getEmbeddingProvider({ ORBIT_EMBEDDINGS: "ollama", OLLAMA_BASE_URL: "http://ollama:11434/", ORBIT_EMBEDDINGS_MODEL: "mxbai-embed-large" });

    expect(await provider?.embed(["a"])).toEqual([[0.1, 0.2]]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://ollama:11434/api/embed");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ model: "mxbai-embed-large", input: ["a"] });
  });

  it("fails loudly when the chosen provider has no key", () => {
    expect(() => getEmbeddingProvider({ ORBIT_EMBEDDINGS: "voyage" })).toThrow("requires VOYAGE_API_KEY");
  });
});
