import { analyzeCoverage } from "@/services/planning/coverage-analyzer";
import { reconstructJourneys } from "@/services/planning/journey-reconstructor";
import { generateTestCases } from "@/services/planning/test-case-generator";
import { prioritizeTestCases, filterByMode } from "@/services/planning/prioritizer";
import { getActivePlan, getNextVersion, storePlan } from "@/services/planning/plan-cache";
import type { CoverageReport } from "@/services/planning/coverage-analyzer";
import type { Journey } from "@/services/planning/journey-reconstructor";
import type { TestCase } from "@/agents/schemas/test-plan";
import type { TestPlan as PrismaTestPlan, TestCase as PrismaTestCase } from "@/generated/prisma/client";
import type { OperationsMap } from "@/agents/schemas/operations-map";

interface PlannerInput {
  projectId: string;
  mode?: "full" | "smoke" | "regression" | "targeted";
  focusAreas?: string[];
  excludePaths?: string[];
  maxTestCases?: number;
  operationsMap?: OperationsMap;
}

interface PlannerResult {
  plan: PrismaTestPlan;
  testCases: PrismaTestCase[];
  coverage: CoverageReport;
  journeys: Journey[];
  tokensUsed: { input: number; output: number };
}

export async function generatePlan(input: PlannerInput): Promise<PlannerResult> {
  const {
    projectId,
    mode = "full",
    focusAreas,
    excludePaths,
    maxTestCases,
    operationsMap,
  } = input;

  // Step 1: Analyze coverage and reconstruct journeys in parallel
  const [coverage, journeys] = await Promise.all([
    analyzeCoverage(projectId),
    reconstructJourneys(projectId),
  ]);

  // Step 2: Determine next version
  const version = await getNextVersion(projectId);

  // Step 3: Generate test cases via LLM
  const generationResult = await generateTestCases({
    projectId,
    version,
    mode,
    coverageReport: coverage,
    journeys,
    focusAreas,
    excludePaths,
    maxTestCases,
    operationsMap,
  });

  // Step 4: Prioritize and filter
  const prioritized = prioritizeTestCases(generationResult.testCases, coverage);
  const filtered = filterByMode(prioritized, mode, maxTestCases);

  // Step 5: Build summary metadata
  const summary = buildSummary(filtered, generationResult.metadata);

  // Step 6: Store plan in database
  const { plan, testCases } = await storePlan(projectId, version, filtered, summary);

  return {
    plan,
    testCases,
    coverage,
    journeys,
    tokensUsed: generationResult.tokensUsed,
  };
}

export async function getExistingPlan(projectId: string) {
  return getActivePlan(projectId);
}

/**
 * Entry point for the orchestrator pipeline.
 * Accepts the interface expected by `src/services/orchestrator/pipeline.ts`.
 */
export async function runPlanner(
  projectId: string,
  config: { testMode: "full" | "smoke" | "regression" | "targeted" }
): Promise<PrismaTestPlan> {
  const result = await generatePlan({ projectId, mode: config.testMode });
  return result.plan;
}

function buildSummary(
  testCases: TestCase[],
  generatedMetadata: {
    totalTests: number;
    coverageByJourney: Record<string, number>;
    coverageByType: Record<string, number>;
    estimatedCredits: number;
  }
): Record<string, unknown> {
  const coverageByJourney: Record<string, number> = {};
  const coverageByType: Record<string, number> = {};

  for (const tc of testCases) {
    coverageByJourney[tc.journey] = (coverageByJourney[tc.journey] ?? 0) + 1;
    coverageByType[tc.type] = (coverageByType[tc.type] ?? 0) + 1;
  }

  return {
    totalTests: testCases.length,
    coverageByJourney,
    coverageByType,
    estimatedCredits: testCases.length, // ~1 credit per test case
    generatedMetadata,
  };
}
