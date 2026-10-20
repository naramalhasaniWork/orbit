import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    modelRegistry: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { discoverOpenRouterModels } from "@/server/ai/openrouter-registry";
import { openrouterProvider } from "@/server/ai/providers/openai-compatible";
import { ProviderError } from "@/server/ai/errors";

const MOCK_API_KEY = "sk-or-test-key-12345";

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    body: null,
  } as unknown as Response;
}

describe("openrouter provider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env.OPENROUTER_API_KEY = MOCK_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    delete process.env.OPENROUTER_API_KEY;
  });

  describe("openrouterProvider.complete", () => {
    it("returns a completion on success", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          model: "test-model",
        })
      );

      const result = await openrouterProvider.complete({
        model: "test-model",
        system: "You are a bot.",
        messages: [{ role: "user", content: "Hi" }],
        apiKey: MOCK_API_KEY,
      });

      expect(result.content).toBe("Hello!");
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.model).toBe("test-model");
      expect(result.stopReason).toBe("stop");
    });

    it("sends correct headers including Referer and X-Title", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
      );

      await openrouterProvider.complete({
        model: "m",
        system: "s",
        messages: [],
        apiKey: MOCK_API_KEY,
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1].headers;
      expect(headers["Authorization"]).toBe(`Bearer ${MOCK_API_KEY}`);
      expect(headers["HTTP-Referer"]).toBe("https://useorbit.dev");
      expect(headers["X-Title"]).toBe("Orbit Testing Platform");
    });

    it("uses env OPENROUTER_API_KEY when no key is provided", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
      );

      await openrouterProvider.complete({
        model: "m",
        system: "s",
        messages: [],
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers["Authorization"]).toBe(`Bearer ${MOCK_API_KEY}`);
    });

    it("throws when no API key is available", async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        openrouterProvider.complete({
          model: "m",
          system: "s",
          messages: [],
        })
      ).rejects.toThrow("No openrouter API key");
    });

    // Retries belong to the gateway; the provider classifies the failure.
    it("reports 429 as retryable with the server's retry-after", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ...mockFetchResponse({ error: "rate limited" }, 429),
        headers: new Headers({ "retry-after": "2" }),
      });

      const err = await openrouterProvider
        .complete({ model: "m", system: "s", messages: [], apiKey: MOCK_API_KEY })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).retryable).toBe(true);
      expect((err as ProviderError).retryAfterMs).toBe(2000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("reports 400 as not retryable", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({ error: "bad request" }, 400)
      );

      const err = await openrouterProvider
        .complete({ model: "m", system: "s", messages: [], apiKey: MOCK_API_KEY })
        .catch((e: unknown) => e);
      expect((err as ProviderError).message).toContain("openrouter API error (400)");
      expect((err as ProviderError).retryable).toBe(false);
    });

    it("throws when no choices returned", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({ choices: [], usage: {} })
      );

      await expect(
        openrouterProvider.complete({
          model: "m",
          system: "s",
          messages: [],
          apiKey: MOCK_API_KEY,
        })
      ).rejects.toThrow("No completion choice returned");
    });

    it("handles missing usage fields gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: "ok" }, finish_reason: null }],
        })
      );

      const result = await openrouterProvider.complete({
        model: "m",
        system: "s",
        messages: [],
        apiKey: MOCK_API_KEY,
      });

      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
      expect(result.stopReason).toBeNull();
    });
  });

  describe("discoverOpenRouterModels", () => {
    it("parses models from OpenRouter API response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          data: [
            {
              id: "anthropic/claude-3-haiku",
              name: "Claude 3 Haiku",
              context_length: 200000,
              pricing: { prompt: "0.00000025", completion: "0.00000125" },
              supported_parameters: ["tools", "temperature"],
              architecture: { modality: "text+image" },
            },
            {
              id: "openai/gpt-4o",
              name: "GPT-4o",
              context_length: 128000,
              pricing: { prompt: "0.000005", completion: "0.000015" },
              supported_parameters: ["temperature"],
              architecture: { modality: "text" },
            },
          ],
        })
      );

      const models = await discoverOpenRouterModels(MOCK_API_KEY);

      expect(models).toHaveLength(2);
      expect(models[0].modelId).toBe("anthropic/claude-3-haiku");
      expect(models[0].displayName).toBe("Claude 3 Haiku");
      expect(models[0].contextWindow).toBe(200000);
      expect(models[0].capabilities.functionCalling).toBe(true);
      expect(models[0].capabilities.vision).toBe(true);
      expect(models[1].capabilities.functionCalling).toBe(false);
      expect(models[1].capabilities.vision).toBe(false);
    });

    it("handles empty model list", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({ data: [] })
      );

      const models = await discoverOpenRouterModels(MOCK_API_KEY);
      expect(models).toHaveLength(0);
    });

    it("handles missing data field", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({})
      );

      const models = await discoverOpenRouterModels(MOCK_API_KEY);
      expect(models).toHaveLength(0);
    });

    it("throws on API error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse("Unauthorized", 401)
      );

      await expect(
        discoverOpenRouterModels(MOCK_API_KEY)
      ).rejects.toThrow("OpenRouter models API error (401)");
    });

    it("handles models with missing fields gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          data: [{ id: "some/model" }],
        })
      );

      const models = await discoverOpenRouterModels(MOCK_API_KEY);
      expect(models[0].modelId).toBe("some/model");
      expect(models[0].displayName).toBe("some/model");
      expect(models[0].contextWindow).toBe(0);
      expect(models[0].inputCostPer1M).toBe(0);
    });
  });

  describe("openrouterProvider.stream", () => {
    it("yields streamed content chunks", async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2},"model":"m"}\n\n',
        "data: [DONE]\n\n",
      ];

      const encoder = new TextEncoder();
      let chunkIndex = 0;

      const mockBody = {
        getReader: () => ({
          read: vi.fn().mockImplementation(() => {
            if (chunkIndex < chunks.length) {
              return Promise.resolve({
                done: false,
                value: encoder.encode(chunks[chunkIndex++]),
              });
            }
            return Promise.resolve({ done: true, value: undefined });
          }),
          releaseLock: vi.fn(),
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockBody,
      });

      const gen = openrouterProvider.stream({
        model: "m",
        system: "s",
        messages: [],
        apiKey: MOCK_API_KEY,
      });

      const yielded: string[] = [];
      let result;
      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value;
          break;
        }
        yielded.push(value);
      }

      expect(yielded).toEqual(["Hello", " world"]);
      expect(result.content).toBe("Hello world");
      expect(result.stopReason).toBe("stop");
    });

    it("throws on non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Server error"),
        body: null,
      });

      const gen = openrouterProvider.stream({
        model: "m",
        system: "s",
        messages: [],
        apiKey: MOCK_API_KEY,
      });

      await expect(gen.next()).rejects.toThrow("openrouter API error (500)");
    });

    it("throws when response body is null", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      });

      const gen = openrouterProvider.stream({
        model: "m",
        system: "s",
        messages: [],
        apiKey: MOCK_API_KEY,
      });

      await expect(gen.next()).rejects.toThrow("no response body");
    });
  });
});
