import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agentConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  modelRegistry: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  workspace: { findUnique: vi.fn().mockResolvedValue(null) },
  globalModelPolicy: { findMany: vi.fn().mockResolvedValue([]) },
  providerConfig: { findUnique: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/vault", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted-key"),
}));

import { providerForModel } from "@/server/ai/providers";
import {
  getModelForTask,
  getModelCosts,
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

  describe("providerForModel", () => {
    it("returns anthropic for claude models", async () => {
      expect(await providerForModel("claude-sonnet-4-6")).toBe("anthropic");
    });

    it("returns openai for gpt models", async () => {
      expect(await providerForModel("gpt-4o")).toBe("openai");
    });

    it("returns openrouter for unknown models when not in registry", async () => {
      mockPrisma.modelRegistry.findFirst.mockResolvedValueOnce(null);
      expect(await providerForModel("mistral/mistral-large")).toBe("openrouter");
    });

    it("returns registry provider for dynamic models", async () => {
      mockPrisma.modelRegistry.findFirst.mockResolvedValueOnce({
        provider: "custom",
      });
      expect(await providerForModel("meta-llama/llama-3")).toBe("openai-compatible");
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
      expect(model).toBe("claude-sonnet-5-5");
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
});
