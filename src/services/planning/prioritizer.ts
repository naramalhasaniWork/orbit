import type { TestCase } from "@/agents/schemas/test-plan";
import type { CoverageReport } from "@/services/planning/coverage-analyzer";

const WEIGHTS = {
  criticality: 0.4,
  risk: 0.35,
  coverageGap: 0.25,
} as const;

const CRITICAL_JOURNEYS = new Set([
  "authentication",
  "checkout",
  "payment",
  "billing",
]);

const CRITICAL_TYPES = new Set([
  "auth",
  "edge_case",
]);

function computePriorityScore(
  criticality: number,
  risk: number,
  coverageGap: number
): number {
  const raw =
    criticality * WEIGHTS.criticality +
    risk * WEIGHTS.risk +
    coverageGap * WEIGHTS.coverageGap;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function adjustCriticalityForJourney(
  testCase: TestCase,
  _coverage: CoverageReport
): number {
  let score = testCase.criticality;

  // Boost criticality for auth/payment journeys
  if (CRITICAL_JOURNEYS.has(testCase.journey.toLowerCase())) {
    score = Math.min(100, score + 15);
  }

  // Boost criticality for auth and edge case test types
  if (CRITICAL_TYPES.has(testCase.type)) {
    score = Math.min(100, score + 10);
  }

  return score;
}

function adjustRiskFromCoverage(
  testCase: TestCase,
  coverage: CoverageReport
): number {
  let score = testCase.risk;

  // If the journey has low coverage, bump risk
  const journeyCov = coverage.coverageByJourney.find(
    (j) => j.journey.toLowerCase() === testCase.journey.toLowerCase()
  );
  if (journeyCov && journeyCov.percentage < 30) {
    score = Math.min(100, score + 10);
  }

  return score;
}

function adjustCoverageGap(
  testCase: TestCase,
  coverage: CoverageReport
): number {
  let score = testCase.coverageGap;

  // If the type has low coverage, boost the gap score
  const typeCov = coverage.coverageByType[testCase.type];
  if (typeCov && typeCov.percentage < 20) {
    score = Math.min(100, score + 15);
  }

  return score;
}

export function prioritizeTestCases(
  testCases: TestCase[],
  coverage: CoverageReport
): TestCase[] {
  const scored = testCases.map((tc) => {
    const adjustedCriticality = adjustCriticalityForJourney(tc, coverage);
    const adjustedRisk = adjustRiskFromCoverage(tc, coverage);
    const adjustedGap = adjustCoverageGap(tc, coverage);
    const priorityScore = computePriorityScore(adjustedCriticality, adjustedRisk, adjustedGap);

    return {
      ...tc,
      criticality: adjustedCriticality,
      risk: adjustedRisk,
      coverageGap: adjustedGap,
      priorityScore,
    };
  });

  // Sort descending by priority score
  return scored.sort((a, b) => b.priorityScore - a.priorityScore);
}

export function filterByMode(
  testCases: TestCase[],
  mode: "full" | "smoke" | "regression" | "targeted",
  maxCases?: number
): TestCase[] {
  switch (mode) {
    case "smoke":
      return testCases.filter((tc) => tc.priorityScore >= 80).slice(0, 10);

    case "regression":
      return testCases.filter((tc) => tc.type === "regression");

    case "targeted":
      return maxCases ? testCases.slice(0, maxCases) : testCases;

    case "full":
    default:
      return maxCases ? testCases.slice(0, maxCases) : testCases;
  }
}
