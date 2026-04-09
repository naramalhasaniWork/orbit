import { describe, it, expect } from "vitest";
import {
  identifyUncoveredNodes,
  shouldRunAnotherIteration,
  calculateCoverage,
  buildFeedbackSummary,
  type CoverageNode,
} from "@/services/planning/coverage-feedback";

describe("identifyUncoveredNodes", () => {
  it("should return nodes not in the covered set", () => {
    const allNodes: CoverageNode[] = [
      { id: "1", name: "LoginPage", type: "route" },
      { id: "2", name: "Dashboard", type: "route" },
      { id: "3", name: "Settings", type: "route" },
    ];
    const covered = new Set(["1", "2"]);
    const result = identifyUncoveredNodes(allNodes, covered);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Settings");
  });

  it("should return empty array when all covered", () => {
    const allNodes: CoverageNode[] = [
      { id: "1", name: "A", type: "route" },
    ];
    const result = identifyUncoveredNodes(allNodes, new Set(["1"]));
    expect(result).toHaveLength(0);
  });

  it("should return all when none covered", () => {
    const allNodes: CoverageNode[] = [
      { id: "1", name: "A", type: "route" },
      { id: "2", name: "B", type: "component" },
    ];
    const result = identifyUncoveredNodes(allNodes, new Set());
    expect(result).toHaveLength(2);
  });

  it("should handle empty node list", () => {
    const result = identifyUncoveredNodes([], new Set(["1"]));
    expect(result).toHaveLength(0);
  });
});

describe("shouldRunAnotherIteration", () => {
  it("should return true when coverage below target and budget available", () => {
    expect(shouldRunAnotherIteration(60, 80, 1, 3, 1000, 5000)).toBe(true);
  });

  it("should return false when coverage meets target", () => {
    expect(shouldRunAnotherIteration(80, 80, 1, 3, 1000, 5000)).toBe(false);
  });

  it("should return false when coverage exceeds target", () => {
    expect(shouldRunAnotherIteration(90, 80, 1, 3, 1000, 5000)).toBe(false);
  });

  it("should return false when max iterations reached", () => {
    expect(shouldRunAnotherIteration(60, 80, 3, 3, 1000, 5000)).toBe(false);
  });

  it("should return false when token budget exhausted", () => {
    expect(shouldRunAnotherIteration(60, 80, 1, 3, 5000, 5000)).toBe(false);
  });

  it("should return false when token budget exceeded", () => {
    expect(shouldRunAnotherIteration(60, 80, 1, 3, 6000, 5000)).toBe(false);
  });
});

describe("calculateCoverage", () => {
  it("should calculate percentage correctly", () => {
    expect(calculateCoverage(100, 75)).toBe(75);
  });

  it("should return 0 for zero total nodes", () => {
    expect(calculateCoverage(0, 0)).toBe(0);
  });

  it("should return 100 when all covered", () => {
    expect(calculateCoverage(50, 50)).toBe(100);
  });

  it("should handle fractional values", () => {
    const result = calculateCoverage(3, 1);
    expect(result).toBeCloseTo(33.33, 1);
  });
});

describe("buildFeedbackSummary", () => {
  it("should return all-covered message when no uncovered nodes", () => {
    const result = buildFeedbackSummary([], 100, 1);
    expect(result).toContain("All nodes are covered");
    expect(result).toContain("100.0%");
  });

  it("should group uncovered nodes by type", () => {
    const nodes: CoverageNode[] = [
      { id: "1", name: "LoginPage", type: "route" },
      { id: "2", name: "Header", type: "component" },
      { id: "3", name: "SettingsPage", type: "route" },
    ];
    const result = buildFeedbackSummary(nodes, 40, 2);
    expect(result).toContain("Iteration 2");
    expect(result).toContain("40.0%");
    expect(result).toContain("3 node(s) remain uncovered");
    expect(result).toContain("### Uncovered routes");
    expect(result).toContain("### Uncovered components");
  });

  it("should include file paths when present", () => {
    const nodes: CoverageNode[] = [
      { id: "1", name: "LoginPage", type: "route", filePath: "src/login.tsx" },
    ];
    const result = buildFeedbackSummary(nodes, 50, 1);
    expect(result).toContain("src/login.tsx");
  });
});
