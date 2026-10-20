import { analyzeCoverage } from "@/services/planning/coverage-analyzer";
import { reconstructJourneys } from "@/services/planning/journey-reconstructor";
import { generateTestCases } from "@/services/planning/test-case-generator";
import { prioritizeTestCases, filterByMode } from "@/services/planning/prioritizer";
import { getActivePlan, getNextVersion, storePlan } from "@/services/planning/plan-cache";
import { search } from "@/server/ai/search";
import type { CoverageReport } from "@/services/planning/coverage-analyzer";
import type { Journey } from "@/services/planning/journey-reconstructor";
import type { TestCase } from "@/agents/schemas/test-plan";
import type { TestPlan as PrismaTestPlan, TestCase as PrismaTestCase } from "@/generated/prisma/client";
import type { OperationsMap } from "@/agents/schemas/operations-map";

interface SemanticNode {
  name: string;
  type: string;
  filePath: string;
  similarity: number;
}

export interface PlanProgress {
  phase: "coverage" | "journeys" | "generating" | "prioritizing" | "saving";
  message: string;
  progress: number;
}

interface PlannerInput {
  projectId: string;
  mode?: "full" | "smoke" | "regression" | "targeted";
  focusAreas?: string[];
  excludePaths?: string[];
  maxTestCases?: number;
  operationsMap?: OperationsMap;
  onProgress?: (progress: PlanProgress) => Promise<void> | void;
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
  const report = async (p: PlanProgress) => {
    await input.onProgress?.(p);
  };

  // Retrieve semantic context for focus areas (non-blocking)
  let semanticContext: SemanticNode[] = [];
  if (focusAreas && focusAreas.length > 0) {
    try {
      const focusText = focusAreas.join(" ");
      const similar = await search.semantic(projectId, focusText, 20);
      semanticContext = similar.map((n) => ({
        name: n.name,
        type: n.type,
        filePath: n.file_path,
        similarity: n.similarity,
      }));
    } catch {
      // Semantic retrieval unavailable — proceed without it
    }
  }

  // Retrieve git history (non-blocking)
  let gitHistory: Array<{ filePath: string; commitCount: number; totalChanges: number; lastChanged: string }> = [];
  try {
    const gitModule = await import("@/services/indexing/git-history") as {
      getGitHistoryForProject: (projectId: string, daysSince?: number) => Promise<Array<{ filePath: string; commitHash: string; date: string; message: string; changeCount: number }>>;
      aggregateChangeFrequency: (changes: Array<{ filePath: string; commitHash: string; date: string; message: string; changeCount: number }>) => Map<string, { commitCount: number; totalChanges: number; lastChanged: string; recentCommitMessages: string[] }>;
    };
    const changes = await gitModule.getGitHistoryForProject(projectId, 30);
    const frequency = gitModule.aggregateChangeFrequency(changes);
    gitHistory = Array.from(frequency.entries())
      .map(([path, freq]) => ({
        filePath: path,
        commitCount: freq.commitCount,
        totalChanges: freq.totalChanges,
        lastChanged: freq.lastChanged,
      }))
      .sort((a, b) => b.totalChanges - a.totalChanges)
      .slice(0, 50);
  } catch { /* git history unavailable */ }

  // Step 1: Analyze coverage and reconstruct journeys in parallel
  await report({ phase: "coverage", message: "Analyzing coverage gaps...", progress: 10 });
  const useSemanticMatching = semanticContext.length > 0;
  const [coverage, journeys] = await Promise.all([
    analyzeCoverage(projectId, operationsMap, useSemanticMatching),
    reconstructJourneys(projectId, operationsMap, useSemanticMatching),
  ]);

  await report({
    phase: "journeys",
    message: `Found ${journeys.length} user journeys, ${coverage.untestedRoutes.length} untested routes`,
    progress: 25,
  });

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
    onProgress: (message, progress) => report({ phase: "generating", message, progress }),
  });

  // Step 4: Prioritize and filter
  await report({
    phase: "prioritizing",
    message: `Generated ${generationResult.testCases.length} test cases, prioritizing...`,
    progress: 85,
  });
  const prioritized = prioritizeTestCases(generationResult.testCases, coverage);
  const filtered = filterByMode(prioritized, mode, maxTestCases);

  // Step 5: Build summary metadata
  const summary = buildSummary(filtered, generationResult.metadata, operationsMap);

  // Step 6: Store plan in database
  await report({ phase: "saving", message: "Saving test plan...", progress: 92 });
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
  },
  operationsMap?: OperationsMap
): Record<string, unknown> {
  const coverageByJourney: Record<string, number> = {};
  const coverageByType: Record<string, number> = {};

  for (const tc of testCases) {
    coverageByJourney[tc.journey] = (coverageByJourney[tc.journey] ?? 0) + 1;
    coverageByType[tc.type] = (coverageByType[tc.type] ?? 0) + 1;
  }

  const summary: Record<string, unknown> = {
    totalTests: testCases.length,
    coverageByJourney,
    coverageByType,
    estimatedCredits: testCases.length,
    generatedMetadata,
  };

  if (operationsMap) {
    summary.operationsMap = operationsMap;
  }

  return summary;
}
