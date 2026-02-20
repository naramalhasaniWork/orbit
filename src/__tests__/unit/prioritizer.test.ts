import { describe, it, expect } from "vitest";
import { prioritizeTestCases, filterByMode } from "@/services/planning/prioritizer";
import type { TestCase } from "@/agents/schemas/test-plan";
import type { CoverageReport } from "@/services/planning/coverage-analyzer";

function makeTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: "tc-1",
    name: "Test case",
    type: "journey",
    journey: "shopping",
    priorityScore: 50,
    criticality: 50,
    risk: 50,
    coverageGap: 50,
    steps: [{ action: "click button", expected: "page loads" }],
    rationale: "Tests core flow",
    edgeCases: [],
    ...overrides,
  };
}

function makeCoverage(overrides: Partial<CoverageReport> = {}): CoverageReport {
  return {
    totalNodes: 10,
    coveredNodes: 5,
    overallPercentage: 50,
    untestedRoutes: [],
    untestedEndpoints: [],
    untestedComponents: [],
    coverageByJourney: [],
    coverageByType: {},
    ...overrides,
  };
}

describe("prioritizer", () => {
  describe("prioritizeTestCases", () => {
    it("sorts test cases by priority score descending", () => {
      const cases = [
        makeTestCase({ id: "low", criticality: 10, risk: 10, coverageGap: 10 }),
        makeTestCase({ id: "high", criticality: 90, risk: 90, coverageGap: 90 }),
        makeTestCase({ id: "mid", criticality: 50, risk: 50, coverageGap: 50 }),
      ];

      const result = prioritizeTestCases(cases, makeCoverage());
      expect(result[0].id).toBe("high");
      expect(result[result.length - 1].id).toBe("low");
    });

    it("boosts criticality for authentication journey", () => {
      const authCase = makeTestCase({ journey: "authentication", criticality: 50 });
      const normalCase = makeTestCase({ journey: "shopping", criticality: 50 });

      const result = prioritizeTestCases([normalCase, authCase], makeCoverage());
      const authResult = result.find((r) => r.journey === "authentication");
      const normalResult = result.find((r) => r.journey === "shopping");

      expect(authResult!.criticality).toBe(65); // +15 boost
      expect(normalResult!.criticality).toBe(50);
    });

    it("boosts criticality for payment journey", () => {
      const paymentCase = makeTestCase({ journey: "payment", criticality: 60 });
      const [result] = prioritizeTestCases([paymentCase], makeCoverage());
      expect(result.criticality).toBe(75); // +15
    });

    it("boosts criticality for auth test type", () => {
      const authType = makeTestCase({ type: "auth", criticality: 50 });
      const [result] = prioritizeTestCases([authType], makeCoverage());
      expect(result.criticality).toBe(60); // +10
    });

    it("boosts criticality for edge_case test type", () => {
      const edgeCase = makeTestCase({ type: "edge_case", criticality: 50 });
      const [result] = prioritizeTestCases([edgeCase], makeCoverage());
      expect(result.criticality).toBe(60); // +10
    });

    it("caps criticality at 100 with combined boosts", () => {
      const authPayment = makeTestCase({
        journey: "authentication",
        type: "auth",
        criticality: 90,
      });
      const [result] = prioritizeTestCases([authPayment], makeCoverage());
      expect(result.criticality).toBe(100); // 90 + 15 + 10 = 115, capped at 100
    });

    it("boosts risk when journey has low coverage", () => {
      const tc = makeTestCase({ journey: "checkout", risk: 40 });
      const coverage = makeCoverage({
        coverageByJourney: [{ journey: "checkout", totalNodes: 10, coveredNodes: 1, percentage: 10 }],
      });

      const [result] = prioritizeTestCases([tc], coverage);
      expect(result.risk).toBe(50); // +10 boost for <30% coverage
    });

    it("does not boost risk when journey coverage is adequate", () => {
      const tc = makeTestCase({ journey: "checkout", risk: 40 });
      const coverage = makeCoverage({
        coverageByJourney: [{ journey: "checkout", totalNodes: 10, coveredNodes: 8, percentage: 80 }],
      });

      const [result] = prioritizeTestCases([tc], coverage);
      expect(result.risk).toBe(40);
    });

    it("boosts coverageGap when type has low coverage", () => {
      const tc = makeTestCase({ type: "auth", coverageGap: 30 });
      const coverage = makeCoverage({
        coverageByType: { auth: { total: 10, covered: 1, percentage: 10 } },
      });

      const [result] = prioritizeTestCases([tc], coverage);
      expect(result.coverageGap).toBe(45); // +15 for <20% coverage
    });

    it("clamps priority score between 0 and 100", () => {
      const highCase = makeTestCase({ criticality: 100, risk: 100, coverageGap: 100 });
      const [result] = prioritizeTestCases([highCase], makeCoverage());
      expect(result.priorityScore).toBeLessThanOrEqual(100);
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
    });

    it("handles empty test case array", () => {
      const result = prioritizeTestCases([], makeCoverage());
      expect(result).toEqual([]);
    });
  });

  describe("filterByMode", () => {
    const cases = Array.from({ length: 15 }, (_, i) =>
      makeTestCase({
        id: `tc-${i}`,
        priorityScore: 95 - i * 5,
        type: i % 3 === 0 ? "regression" : "journey",
      })
    );

    it("smoke mode returns top 10 with priorityScore >= 80", () => {
      const result = filterByMode(cases, "smoke");
      expect(result.length).toBeLessThanOrEqual(10);
      result.forEach((tc) => expect(tc.priorityScore).toBeGreaterThanOrEqual(80));
    });

    it("regression mode returns only regression type tests", () => {
      const result = filterByMode(cases, "regression");
      result.forEach((tc) => expect(tc.type).toBe("regression"));
    });

    it("targeted mode with maxCases limits output", () => {
      const result = filterByMode(cases, "targeted", 3);
      expect(result).toHaveLength(3);
    });

    it("targeted mode without maxCases returns all", () => {
      const result = filterByMode(cases, "targeted");
      expect(result).toHaveLength(cases.length);
    });

    it("full mode returns all test cases", () => {
      const result = filterByMode(cases, "full");
      expect(result).toHaveLength(cases.length);
    });

    it("full mode with maxCases limits output", () => {
      const result = filterByMode(cases, "full", 5);
      expect(result).toHaveLength(5);
    });
  });
});
