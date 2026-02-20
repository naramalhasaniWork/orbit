import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    promptVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/agents/prompts/operator-layer", () => ({
  getOperatorPrompt: vi.fn().mockReturnValue("[OPERATOR LAYER]"),
}));

vi.mock("@/agents/prompts/user-layer", () => ({
  buildUserLayer: vi.fn().mockImplementation((input) => {
    if (input?.workspaceConfig?.customPrompt) {
      return `[USER LAYER: ${input.workspaceConfig.customPrompt}]`;
    }
    return "";
  }),
}));

vi.mock("@/agents/prompts/default-prompts", () => ({
  DEFAULT_USER_PROMPTS: {
    analyst: "Default analyst prompt",
    planner: "Default planner prompt",
    executor: "Default executor prompt",
    reporter: "Default reporter prompt",
    auditor: "Default auditor prompt",
  },
}));

import {
  buildPrompt,
  buildPromptWithCustom,
  getActivePrompt,
  getEffectivePrompt,
  invalidatePromptCache,
  estimateTokens,
  trimToTokenBudget,
} from "@/agents/prompts/prompt-builder";
import { prisma } from "@/lib/db";

describe("prompt-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Invalidate all cached prompts between tests
    invalidatePromptCache("ws-test", "analyst");
    invalidatePromptCache("ws-test", "planner");
    invalidatePromptCache("ws-test", "executor");
    invalidatePromptCache("ws-test", "reporter");
    invalidatePromptCache("ws-test", "auditor");
  });

  describe("getActivePrompt", () => {
    it("returns null when no custom prompt exists", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce(null);
      const result = await getActivePrompt("ws-test", "analyst");
      expect(result).toBeNull();
    });

    it("returns custom content when a version is active", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce({
        content: "My custom analyst prompt",
      } as never);
      const result = await getActivePrompt("ws-test", "analyst");
      expect(result).toBe("My custom analyst prompt");
    });

    it("caches the result and returns from cache on second call", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce({
        content: "cached content",
      } as never);

      const first = await getActivePrompt("ws-test", "planner");
      const second = await getActivePrompt("ws-test", "planner");

      expect(first).toBe("cached content");
      expect(second).toBe("cached content");
      expect(prisma.promptVersion.findFirst).toHaveBeenCalledTimes(1);
    });

    it("refetches after cache invalidation", async () => {
      vi.mocked(prisma.promptVersion.findFirst)
        .mockResolvedValueOnce({ content: "v1" } as never)
        .mockResolvedValueOnce({ content: "v2" } as never);

      const first = await getActivePrompt("ws-test", "executor");
      invalidatePromptCache("ws-test", "executor");
      const second = await getActivePrompt("ws-test", "executor");

      expect(first).toBe("v1");
      expect(second).toBe("v2");
      expect(prisma.promptVersion.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe("getEffectivePrompt", () => {
    it("returns custom prompt when one exists", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce({
        content: "custom analyst",
      } as never);

      const result = await getEffectivePrompt("ws-test", "analyst");
      expect(result).toBe("custom analyst");
    });

    it("returns default prompt when no custom exists", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce(null);

      const result = await getEffectivePrompt("ws-test", "analyst");
      expect(result).toBe("Default analyst prompt");
    });
  });

  describe("buildPrompt", () => {
    it("assembles operator + agent instructions", () => {
      const result = buildPrompt({
        agentRole: "analyst",
        agentInstructions: "Analyze the repo.",
      });

      expect(result.systemPrompt).toContain("[OPERATOR LAYER]");
      expect(result.systemPrompt).toContain("Analyze the repo.");
      expect(result.cacheablePrefix).toContain("[OPERATOR LAYER]");
      expect(result.dynamicSuffix).toContain("Analyze the repo.");
    });

    it("includes user layer when provided", () => {
      const result = buildPrompt({
        agentRole: "planner",
        agentInstructions: "Plan tests.",
        userLayer: {
          workspaceConfig: { customPrompt: "Focus on payments" },
        },
      });

      expect(result.systemPrompt).toContain("[USER LAYER: Focus on payments]");
      expect(result.cacheablePrefix).toContain("[USER LAYER: Focus on payments]");
    });

    it("includes domain knowledge in dynamic section", () => {
      const result = buildPrompt({
        agentRole: "executor",
        agentInstructions: "Execute tests.",
        domainKnowledge: "This app uses Stripe for payments.",
      });

      expect(result.dynamicSuffix).toContain("This app uses Stripe for payments.");
      expect(result.dynamicSuffix).toContain("Execute tests.");
    });

    it("domain knowledge is NOT in cacheable prefix", () => {
      const result = buildPrompt({
        agentRole: "executor",
        agentInstructions: "Execute.",
        domainKnowledge: "Domain info here.",
      });

      expect(result.cacheablePrefix).not.toContain("Domain info here.");
    });
  });

  describe("buildPromptWithCustom", () => {
    it("uses custom prompt from DB when available", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce({
        content: "DB custom prompt",
      } as never);

      const result = await buildPromptWithCustom("ws-test", {
        agentRole: "analyst",
        agentInstructions: "Analyze.",
      });

      expect(result.systemPrompt).toContain("[USER LAYER: DB custom prompt]");
    });

    it("falls back to default when no custom prompt in DB", async () => {
      vi.mocked(prisma.promptVersion.findFirst).mockResolvedValueOnce(null);

      const result = await buildPromptWithCustom("ws-test", {
        agentRole: "analyst",
        agentInstructions: "Analyze.",
      });

      expect(result.systemPrompt).toContain("[USER LAYER: Default analyst prompt]");
    });
  });

  describe("estimateTokens", () => {
    it("estimates ~4 chars per token", () => {
      const text = "a".repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });

    it("rounds up", () => {
      expect(estimateTokens("abc")).toBe(1);
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("trimToTokenBudget", () => {
    it("returns text unchanged when under budget", () => {
      const text = "Short text";
      expect(trimToTokenBudget(text, 1000)).toBe(text);
    });

    it("trims text when over budget", () => {
      const text = "a".repeat(4000); // ~1000 tokens
      const trimmed = trimToTokenBudget(text, 100);
      expect(trimmed.length).toBeLessThan(text.length);
      expect(trimmed).toContain("[Content trimmed to fit token budget]");
    });
  });
});
