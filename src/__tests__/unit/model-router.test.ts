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

import { getModelForTask, getAllTaskMappings } from "@/lib/ai/model-router";
import type { TaskType } from "@/lib/ai/model-router";

describe("model-router", () => {
  describe("getModelForTask", () => {
    it("returns Haiku for framework_detection", () => {
      expect(getModelForTask("framework_detection")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Haiku for route_extraction", () => {
      expect(getModelForTask("route_extraction")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Sonnet for test_generation", () => {
      expect(getModelForTask("test_generation")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Sonnet for browser_execution", () => {
      expect(getModelForTask("browser_execution")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Sonnet for failure_analysis", () => {
      expect(getModelForTask("failure_analysis")).toBe("claude-sonnet-4-20250514");
    });

    it("returns Haiku for report_writing", () => {
      expect(getModelForTask("report_writing")).toBe("claude-3-5-haiku-20241022");
    });

    it("returns Opus for security_testing", () => {
      expect(getModelForTask("security_testing")).toBe("claude-opus-4-20250514");
    });

    it("returns embedding model for embedding task", () => {
      expect(getModelForTask("embedding")).toBe("text-embedding-3-small");
    });

    it("uses workspace override when provided", () => {
      const overrides = {
        modelOverrides: { test_generation: "gpt-4o" } as Partial<Record<TaskType, string>>,
      };
      expect(getModelForTask("test_generation", overrides)).toBe("gpt-4o");
    });

    it("falls back to default when override is not set for task", () => {
      const overrides = {
        modelOverrides: { test_generation: "gpt-4o" } as Partial<Record<TaskType, string>>,
      };
      expect(getModelForTask("security_testing", overrides)).toBe("claude-opus-4-20250514");
    });

    it("ignores empty override object", () => {
      expect(getModelForTask("test_generation", {})).toBe("claude-sonnet-4-20250514");
    });

    it("ignores undefined overrides", () => {
      expect(getModelForTask("test_generation", undefined)).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("getAllTaskMappings", () => {
    it("returns all default mappings without overrides", () => {
      const mappings = getAllTaskMappings();
      expect(mappings.framework_detection).toBe("claude-3-5-haiku-20241022");
      expect(mappings.security_testing).toBe("claude-opus-4-20250514");
      expect(mappings.embedding).toBe("text-embedding-3-small");
      expect(Object.keys(mappings)).toHaveLength(8);
    });

    it("merges workspace overrides into mappings", () => {
      const overrides = {
        modelOverrides: {
          test_generation: "gpt-4o",
          report_writing: "gpt-4o-mini",
        } as Partial<Record<TaskType, string>>,
      };
      const mappings = getAllTaskMappings(overrides);

      expect(mappings.test_generation).toBe("gpt-4o");
      expect(mappings.report_writing).toBe("gpt-4o-mini");
      expect(mappings.framework_detection).toBe("claude-3-5-haiku-20241022");
    });

    it("does not mutate defaults when overrides are applied", () => {
      const overrides = {
        modelOverrides: { test_generation: "custom-model" } as Partial<Record<TaskType, string>>,
      };
      getAllTaskMappings(overrides);

      const defaults = getAllTaskMappings();
      expect(defaults.test_generation).toBe("claude-sonnet-4-20250514");
    });
  });
});
