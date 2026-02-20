import { describe, it, expect, beforeEach } from "vitest";
import { TokenBudget } from "@/services/orchestrator/token-budget";

describe("TokenBudget", () => {
  let budget: TokenBudget;

  beforeEach(() => {
    budget = new TokenBudget();
  });

  describe("record and getUsage", () => {
    it("starts with zero usage", () => {
      const usage = budget.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.cachedTokens).toBe(0);
    });

    it("accumulates token usage", () => {
      budget.record(1000, 200, 100);
      budget.record(500, 150, 50);

      const usage = budget.getUsage();
      expect(usage.inputTokens).toBe(1500);
      expect(usage.outputTokens).toBe(350);
      expect(usage.cachedTokens).toBe(150);
    });

    it("defaults cached tokens to 0", () => {
      budget.record(1000, 200);
      expect(budget.getUsage().cachedTokens).toBe(0);
    });

    it("returns a copy of usage (not mutable reference)", () => {
      budget.record(1000, 200);
      const usage = budget.getUsage();
      usage.inputTokens = 999999;
      expect(budget.getUsage().inputTokens).toBe(1000);
    });
  });

  describe("isOverBudget", () => {
    it("returns false when within budget", () => {
      budget.record(100_000, 50_000);
      expect(budget.isOverBudget()).toBe(false);
    });

    it("returns true when input tokens exceed max", () => {
      budget.record(2_000_001, 0);
      expect(budget.isOverBudget()).toBe(true);
    });

    it("returns true when output tokens exceed max", () => {
      budget.record(0, 500_001);
      expect(budget.isOverBudget()).toBe(true);
    });

    it("returns false at exactly the max", () => {
      budget.record(2_000_000, 500_000);
      expect(budget.isOverBudget()).toBe(false);
    });
  });

  describe("isNearBudget", () => {
    it("returns false when well below threshold", () => {
      budget.record(100_000, 50_000);
      expect(budget.isNearBudget()).toBe(false);
    });

    it("returns true when input exceeds 80% of max", () => {
      budget.record(1_600_001, 0);
      expect(budget.isNearBudget()).toBe(true);
    });

    it("returns true when output exceeds 80% of max", () => {
      budget.record(0, 400_001);
      expect(budget.isNearBudget()).toBe(true);
    });

    it("respects custom warning threshold", () => {
      const custom = new TokenBudget({ warningThreshold: 0.5 });
      custom.record(1_000_001, 0);
      expect(custom.isNearBudget()).toBe(true);
    });
  });

  describe("getRemainingInput / getRemainingOutput", () => {
    it("returns full budget when nothing used", () => {
      expect(budget.getRemainingInput()).toBe(2_000_000);
      expect(budget.getRemainingOutput()).toBe(500_000);
    });

    it("returns remaining after usage", () => {
      budget.record(500_000, 100_000);
      expect(budget.getRemainingInput()).toBe(1_500_000);
      expect(budget.getRemainingOutput()).toBe(400_000);
    });

    it("returns 0 when over budget (not negative)", () => {
      budget.record(3_000_000, 600_000);
      expect(budget.getRemainingInput()).toBe(0);
      expect(budget.getRemainingOutput()).toBe(0);
    });
  });

  describe("estimateCost", () => {
    it("returns 0 for zero usage", () => {
      expect(budget.estimateCost()).toBe(0);
    });

    it("computes cost based on effective input (minus cached)", () => {
      budget.record(1000, 1000, 500);
      // effectiveInput = 1000 - 500 = 500
      // inputCost = (500/1000) * 0.003 = 0.0015
      // outputCost = (1000/1000) * 0.015 = 0.015
      // cachedCost = (500/1000) * 0.0003 = 0.00015
      const expected = 0.0015 + 0.015 + 0.00015;
      expect(budget.estimateCost()).toBeCloseTo(expected, 6);
    });

    it("treats all input as effective when no cached tokens", () => {
      budget.record(1000, 0);
      const expected = (1000 / 1000) * 0.003;
      expect(budget.estimateCost()).toBeCloseTo(expected, 6);
    });
  });

  describe("reset", () => {
    it("resets all usage to zero", () => {
      budget.record(1_000_000, 200_000, 50_000);
      budget.reset();

      const usage = budget.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.cachedTokens).toBe(0);
    });
  });

  describe("custom config", () => {
    it("accepts partial config overrides", () => {
      const custom = new TokenBudget({ maxInputTokens: 100 });
      custom.record(101, 0);
      expect(custom.isOverBudget()).toBe(true);
    });

    it("keeps defaults for non-overridden fields", () => {
      const custom = new TokenBudget({ maxInputTokens: 100 });
      expect(custom.getRemainingOutput()).toBe(500_000);
    });
  });
});
