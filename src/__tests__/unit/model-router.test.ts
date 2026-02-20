import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the MODELS import used by model-router
vi.mock("@/lib/ai", () => ({
  MODELS: {
    HAIKU: "claude-3-5-haiku-20241022",
    SONNET: "claude-sonnet-4-20250514",
    OPUS: "claude-opus-4-20250514",
    GPT4O: "gpt-4o",
    GPT4O_MINI: "gpt-4o-mini",
  },
}));

// Mock prisma so getAgentConfig doesn't hit a real DB
vi.mock("@/lib/db", () => ({
  prisma: {
    agentConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { getModelForTask, getModelForTaskSync, getAllTaskMappings } from "@/lib/ai/model-router";
import type { TaskType } from "@/lib/ai/model-router";

describe("model-router", () => {
  describe("getModelForTaskSync", () => {
    it("returns Haiku for framework_detection", () => {
      expect(getModelForTaskSync("framework_detection")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Sonnet for test_generation", () => {
      expect(getModelForTaskSync("test_generation")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Opus for security_testing", () => {
      expect(getModelForTaskSync("security_testing")).toBe("claude-opus-4-20250514");
    });
  });

  describe("getModelForTask (async)", () => {
    it("returns Haiku for framework_detection without workspaceId", async () => {
      expect(await getModelForTask("framework_detection")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Haiku for route_extraction", async () => {
      expect(await getModelForTask("route_extraction")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Sonnet for test_generation", async () => {
      expect(await getModelForTask("test_generation")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Sonnet for browser_execution", async () => {
      expect(await getModelForTask("browser_execution")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Sonnet for failure_analysis", async () => {
      expect(await getModelForTask("failure_analysis")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Haiku for report_writing", async () => {
      expect(await getModelForTask("report_writing")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Opus for security_testing", async () => {
      expect(await getModelForTask("security_testing")).toBe("claude-opus-4-20250514");
    });

    it("returns embedding model for embedding task", async () => {
      expect(await getModelForTask("embedding")).toBe("text-embedding-3-small");
    });

    it("uses legacy workspace override when provided", async () => {
      const overrides = {
        modelOverrides: { test_generation: "gpt-4o" } as Partial<Record<TaskType, string>>,
      };
      expect(await getModelForTask("test_generation", undefined, overrides)).toBe("gpt-4o");
    });

    it("falls back to default when override is not set for task", async () => {
      const overrides = {
        modelOverrides: { test_generation: "gpt-4o" } as Partial<Record<TaskType, string>>,
      };
      expect(await getModelForTask("security_testing", undefined, overrides)).toBe("claude-opus-4-20250514");
    });
  });

  describe("getAllTaskMappings", () => {
    it("returns all default mappings without overrides", async () => {
      const mappings = await getAllTaskMappings();
      expect(mappings.framework_detection).toBe("claude-3-5-haiku-20241022");
      expect(mappings.security_testing).toBe("claude-opus-4-20250514");
      expect(mappings.embedding).toBe("text-embedding-3-small");
    });

    it("merges workspace overrides into mappings", async () => {
      const overrides = {
        modelOverrides: {
          test_generation: "gpt-4o",
          report_writing: "gpt-4o-mini",
        } as Partial<Record<TaskType, string>>,
      };
      const mappings = await getAllTaskMappings(undefined, overrides);

      expect(mappings.test_generation).toBe("gpt-4o");
      expect(mappings.report_writing).toBe("gpt-4o-mini");
      expect(mappings.framework_detection).toBe("claude-3-5-haiku-20241022");
    });

    it("does not mutate defaults when overrides are applied", async () => {
      const overrides = {
        modelOverrides: { test_generation: "custom-model" } as Partial<Record<TaskType, string>>,
      };
      await getAllTaskMappings(undefined, overrides);

      const defaults = await getAllTaskMappings();
      expect(defaults.test_generation).toBe("claude-sonnet-4-20250514");
    });
  });
});
