import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agentConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  modelRegistry: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  workspace: { findUnique: vi.fn().mockResolvedValue(null) },
  globalModelPolicy: { findMany: vi.fn().mockResolvedValue([]) },
  providerConfig: { findUnique: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/lib/ai", () => ({
  MODELS: {
    HAIKU: "claude-haiku-4-5-20251001",
    SONNET: "claude-sonnet-4-6",
    OPUS: "claude-opus-4-6",
    GPT_5_2: "gpt-5.2",
    GPT_4_1: "gpt-4.1",
    O4_MINI: "o4-mini",
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/vault", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted-key"),
}));

import {
  getProviderForModel,
  getModelForTask,
  getFallbackModels,
  getModelWithFallback,
  estimateTaskCost,
  getModelCosts,
  getAvailableModels,
  getWorkspaceApiKey,
  getAgentConfig,
  invalidateAgentConfigCache,
  taskToAgentPhase,
} from "@/lib/ai/model-router";

describe("model-router extended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear internal caches by invalidating all workspace IDs used in tests
    for (const wsId of ["test-ws", "ws-1", "ws-config", "ws-cache", "ws-db", "ws-empty", "ws-free"]) {
      invalidateAgentConfigCache(wsId);
    }
  });

  describe("getProviderForModel", () => {
    it("returns anthropic for claude models", async () => {
      expect(await getProviderForModel("claude-sonnet-4-6")).toBe("anthropic");
    });

    it("returns openai for gpt models", async () => {
      expect(await getProviderForModel("gpt-4o")).toBe("openai");
    });

    it("returns openrouter for unknown models when not in registry", async () => {
      mockPrisma.modelRegistry.findFirst.mockResolvedValueOnce(null);
      expect(await getProviderForModel("mistral/mistral-large")).toBe("openrouter");
    });

    it("returns registry provider for dynamic models", async () => {
      mockPrisma.modelRegistry.findFirst.mockResolvedValueOnce({
        provider: "together",
      });
      expect(await getProviderForModel("meta-llama/llama-3")).toBe("together");
    });
  });

  describe("taskToAgentPhase", () => {
    it("maps framework_detection to analyst", () => {
      expect(taskToAgentPhase("framework_detection")).toBe("analyst");
    });

    it("maps test_generation to planner", () => {
      expect(taskToAgentPhase("test_generation")).toBe("planner");
    });

    it("maps browser_execution to executor", () => {
      expect(taskToAgentPhase("browser_execution")).toBe("executor");
    });

    it("maps failure_analysis to reporter", () => {
      expect(taskToAgentPhase("failure_analysis")).toBe("reporter");
    });

    it("returns null for embedding (no phase mapping)", () => {
      expect(taskToAgentPhase("embedding")).toBeNull();
    });
  });

  describe("getAgentConfig", () => {
    it("returns null when no DB config exists", async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValueOnce(null);
      const config = await getAgentConfig("ws-1", "analyst");
      expect(config).toBeNull();
    });

    it("returns config from DB when present", async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValueOnce({
        model: "custom-model",
        temperature: 0.5,
        maxInputTokens: 1000,
        maxOutputTokens: 500,
        customPrompt: "test",
        isEnabled: true,
      });
      const config = await getAgentConfig("ws-config", "analyst");
      expect(config?.model).toBe("custom-model");
      expect(config?.temperature).toBe(0.5);
      expect(config?.isEnabled).toBe(true);
    });

    it("returns cached result on second call within TTL", async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValueOnce({
        model: "cached-model",
        temperature: null,
        maxInputTokens: null,
        maxOutputTokens: null,
        customPrompt: null,
        isEnabled: true,
      });

      const first = await getAgentConfig("ws-cache", "planner");
      const second = await getAgentConfig("ws-cache", "planner");

      expect(first?.model).toBe("cached-model");
      expect(second?.model).toBe("cached-model");
      expect(mockPrisma.agentConfig.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe("getModelForTask with DB config", () => {
    it("uses DB agent config when workspaceId is provided", async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValueOnce({
        model: "db-model",
        temperature: null,
        maxInputTokens: null,
        maxOutputTokens: null,
        customPrompt: null,
        isEnabled: true,
      });

      const model = await getModelForTask("test_generation", "ws-db");
      expect(model).toBe("db-model");
    });

    it("falls back to default when DB returns no model", async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValueOnce({
        model: null,
        temperature: null,
        maxInputTokens: null,
        maxOutputTokens: null,
        customPrompt: null,
        isEnabled: true,
      });

      const model = await getModelForTask("test_generation", "ws-empty");
      expect(model).toBe("claude-sonnet-4-6");
    });
  });

  describe("getFallbackModels", () => {
    it("returns fallbacks for Opus", () => {
      const fallbacks = getFallbackModels("claude-opus-4-6");
      expect(fallbacks).toContain("claude-sonnet-4-6");
      expect(fallbacks).toContain("gpt-5.2");
    });

    it("returns empty array for unknown model", () => {
      expect(getFallbackModels("unknown-model")).toEqual([]);
    });
  });

  describe("getModelWithFallback", () => {
    it("returns primary and fallbacks with auto strategy", async () => {
      const result = await getModelWithFallback("security_testing");
      expect(result.primary).toBe("claude-opus-4-6");
      expect(result.fallbacks.length).toBeGreaterThan(0);
    });

    it("returns empty fallbacks with none strategy", async () => {
      const result = await getModelWithFallback(
        "security_testing",
        undefined,
        { fallbackStrategy: "none" }
      );
      expect(result.fallbacks).toEqual([]);
    });
  });

  describe("estimateTaskCost", () => {
    it("calculates cost for known model", async () => {
      const cost = await estimateTaskCost("framework_detection", 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it("returns 0 for unknown model", async () => {
      const cost = await estimateTaskCost(
        "framework_detection",
        1000,
        500,
        0,
        undefined,
        { modelOverrides: { framework_detection: "unknown-model" } }
      );
      expect(cost).toBe(0);
    });

    it("factors in cached tokens", async () => {
      const costNoCached = await estimateTaskCost("framework_detection", 1000, 500, 0);
      const costWithCached = await estimateTaskCost("framework_detection", 1000, 500, 500);
      expect(costWithCached).toBeLessThan(costNoCached);
    });
  });

  describe("getModelCosts", () => {
    it("returns costs for known model", () => {
      const costs = getModelCosts("claude-haiku-4-5-20251001");
      expect(costs).not.toBeNull();
      expect(costs!.input).toBeGreaterThan(0);
    });

    it("returns null for unknown model", () => {
      expect(getModelCosts("nonexistent-model")).toBeNull();
    });
  });

  describe("getWorkspaceApiKey", () => {
    it("returns null when no provider config exists", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce(null);
      const key = await getWorkspaceApiKey("ws-1", "anthropic");
      expect(key).toBeNull();
    });
  });

  describe("getAvailableModels", () => {
    it("returns built-in models when no dynamic models exist", async () => {
      mockPrisma.modelRegistry.findMany.mockResolvedValueOnce([]);
      mockPrisma.globalModelPolicy.findMany.mockResolvedValueOnce([]);

      const models = await getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      const ids = models.map((m) => m.modelId);
      expect(ids).toContain("claude-haiku-4-5-20251001");
      expect(ids).toContain("gpt-5.2");
    });

    it("merges dynamic models without duplicates", async () => {
      mockPrisma.modelRegistry.findMany.mockResolvedValueOnce([
        {
          modelId: "new-model",
          displayName: "New Model",
          provider: "openrouter",
          contextWindow: 32000,
          inputCostPer1M: 1,
          outputCostPer1M: 2,
        },
      ]);
      mockPrisma.globalModelPolicy.findMany.mockResolvedValueOnce([]);

      const models = await getAvailableModels();
      const ids = models.map((m) => m.modelId);
      expect(ids).toContain("new-model");
    });

    it("filters models by policy isAllowed", async () => {
      mockPrisma.modelRegistry.findMany.mockResolvedValueOnce([]);
      mockPrisma.globalModelPolicy.findMany.mockResolvedValueOnce([
        {
          modelId: "gpt-5.2",
          provider: "openai",
          isAllowed: false,
          requiredTier: null,
        },
      ]);

      const models = await getAvailableModels();
      const ids = models.map((m) => m.modelId);
      expect(ids).not.toContain("gpt-5.2");
    });

    it("filters models by tier requirement", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValueOnce({ tier: "free" });
      mockPrisma.modelRegistry.findMany.mockResolvedValueOnce([]);
      mockPrisma.globalModelPolicy.findMany.mockResolvedValueOnce([
        {
          modelId: "claude-opus-4-6",
          provider: "anthropic",
          isAllowed: true,
          requiredTier: "enterprise",
        },
      ]);

      const models = await getAvailableModels("ws-free");
      const ids = models.map((m) => m.modelId);
      expect(ids).not.toContain("claude-opus-4-6");
    });
  });
});
