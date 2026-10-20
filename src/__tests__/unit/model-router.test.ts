import { describe, it, expect, vi, afterEach } from "vitest";

// Mock prisma so getAgentConfig doesn't hit a real DB
vi.mock("@/lib/db", () => ({
  prisma: {
    agentConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import {
  getAgentModels,
  getMaxOutputTokensForModel,
  getModelCosts,
  getModelForTask,
} from "@/lib/ai/model-router";
import type { TaskType } from "@/lib/ai/model-router";

describe("model-router", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getModelForTask defaults (current generation)", () => {
    it.each<[TaskType, string]>([
      ["framework_detection", "claude-haiku-5-5"],
      ["route_extraction", "claude-haiku-5-5"],
      ["report_writing", "claude-haiku-5-5"],
      ["test_generation", "claude-sonnet-5-5"],
      ["failure_analysis", "claude-sonnet-5-5"],
      ["security_testing", "claude-opus-5-5"],
      ["browser_execution", "claude-haiku-5-5"],
    ])("%s -> %s", async (task, model) => {
      expect(await getModelForTask(task)).toBe(model);
    });

    it("reads tier overrides from env", async () => {
      vi.stubEnv("ORBIT_MODEL_BALANCED", "gpt-4.1");
      vi.stubEnv("ORBIT_MODEL_FAST", "openrouter/some-model");
      expect(await getModelForTask("test_generation")).toBe("gpt-4.1");
      expect(await getModelForTask("framework_detection")).toBe("openrouter/some-model");
    });

    it("names the configured embedding model, or none", async () => {
      vi.stubEnv("ORBIT_EMBEDDINGS", "none");
      expect(await getModelForTask("embedding")).toBe("none");
      vi.stubEnv("ORBIT_EMBEDDINGS", "openai");
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      expect(await getModelForTask("embedding")).toBe("text-embedding-3-small");
    });

    it("uses a legacy workspace override when provided", async () => {
      const overrides = { modelOverrides: { test_generation: "gpt-4o" } as Partial<Record<TaskType, string>> };
      expect(await getModelForTask("test_generation", undefined, overrides)).toBe("gpt-4o");
      expect(await getModelForTask("framework_detection", undefined, overrides)).toBe("claude-haiku-5-5");
    });
  });

  describe("getAgentModels", () => {
    it("starts on the fast tier and escalates to the balanced tier", () => {
      expect(getAgentModels({})).toEqual({ primary: "claude-haiku-5-5", escalation: "claude-sonnet-5-5" });
    });

    it("ORBIT_AGENT_MODEL pins one model and disables escalation", () => {
      expect(getAgentModels({ ORBIT_AGENT_MODEL: "claude-opus-5-5" })).toEqual({
        primary: "claude-opus-5-5",
        escalation: null,
      });
    });
  });

  describe("model limits and pricing come from the catalog", () => {
    it("uses the catalog ceiling, then a safe default", () => {
      expect(getMaxOutputTokensForModel("claude-sonnet-5-5")).toBe(64_000);
      expect(getMaxOutputTokensForModel("unknown/model")).toBe(8_192);
      expect(getMaxOutputTokensForModel("claude-sonnet-5-5", 1234)).toBe(1234);
    });

    it("prices current models per 1K tokens", () => {
      expect(getModelCosts("claude-haiku-5-5")).toEqual({ input: 0.0001, output: 0.0005, cached: 0.00001 });
      expect(getModelCosts("nope")).toBeNull();
    });
  });
});
