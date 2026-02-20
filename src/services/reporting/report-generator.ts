import { prisma } from "@/lib/db";
import { createCompletion } from "@/lib/ai";
import { getModelForTask } from "@/lib/ai/model-router";
import {
  buildReporterPrompt,
  type ReporterContext,
} from "@/agents/prompts/reporter-prompt";
import {
  RunSummarySchema,
  type RunSummary,
  type FailureSummary,
} from "@/agents/schemas/run-summary";
import type { FailureAnalysis } from "@/services/reporting/failure-analyzer";

interface HistoricalComparison {
  previousRunId: string | null;
  passRateDelta: number;
  newFailures: string[];
  resolvedFailures: string[];
}

interface GenerateReportResult {
  summary: RunSummary;
  comparison: HistoricalComparison;
}

async function buildHistoricalComparison(
  projectId: string,
  currentRunId: string,
  currentFailedNames: string[]
): Promise<HistoricalComparison> {
  const previousRun = await prisma.testRun.findFirst({
    where: {
      projectId,
      status: "completed",
      id: { not: currentRunId },
    },
    orderBy: { completedAt: "desc" },
    include: {
      results: {
        where: { verdict: "fail" },
        include: { testCase: { select: { name: true } } },
      },
    },
  });

  if (!previousRun) {
    return {
      previousRunId: null,
      passRateDelta: 0,
      newFailures: currentFailedNames,
      resolvedFailures: [],
    };
  }

  const previousFailedNames = previousRun.results.map(
    (r) => r.testCase.name
  );
  const currentPassRate =
    currentFailedNames.length === 0
      ? 1
      : 1 - currentFailedNames.length / (previousRun.totalTests || 1);
  const previousPassRate =
    previousRun.totalTests > 0
      ? previousRun.passed / previousRun.totalTests
      : 1;

  return {
    previousRunId: previousRun.id,
    passRateDelta: currentPassRate - previousPassRate,
    newFailures: currentFailedNames.filter(
      (name) => !previousFailedNames.includes(name)
    ),
    resolvedFailures: previousFailedNames.filter(
      (name) => !currentFailedNames.includes(name)
    ),
  };
}

async function getHistoricalData(
  projectId: string
): Promise<ReporterContext["historicalData"]> {
  const previousRuns = await prisma.testRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: { passed: true, totalTests: true },
  });

  const totalPassed = previousRuns.reduce((sum, r) => sum + r.passed, 0);
  const totalTests = previousRuns.reduce((sum, r) => sum + r.totalTests, 0);
  const previousPassRate = totalTests > 0 ? totalPassed / totalTests : 1;

  const recentFailedResults = await prisma.testResult.findMany({
    where: {
      testRun: { projectId, status: "completed" },
      verdict: "fail",
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { testCase: { select: { name: true } } },
  });

  const flakyTests = await prisma.flakyTest.findMany({
    where: { projectId, isQuarantined: false },
    include: { testCase: { select: { name: true } } },
  });

  return {
    previousRunCount: previousRuns.length,
    previousPassRate,
    recentFailures: recentFailedResults.map((r) => ({
      testName: r.testCase.name,
      failedAt: r.createdAt.toISOString(),
      explanation: r.failureExplanation ?? "No explanation available",
    })),
    flakyTests: flakyTests.map((f) => f.testCase.name),
  };
}

export async function generateReport(
  runId: string,
  failureAnalyses: FailureAnalysis[]
): Promise<GenerateReportResult> {
  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      results: {
        include: { testCase: true },
      },
    },
  });

  const failedNames = run.results
    .filter((r) => r.verdict === "fail")
    .map((r) => r.testCase.name);

  const comparison = await buildHistoricalComparison(
    run.projectId,
    runId,
    failedNames
  );

  const historicalData = await getHistoricalData(run.projectId);
  const model = getModelForTask("report_writing");

  const testResults: ReporterContext["testResults"] = run.results.map(
    (r) => ({
      testId: r.testCaseId,
      testName: r.testCase.name,
      verdict: r.verdict,
      durationMs: r.durationMs ?? 0,
      steps: r.steps as ReporterContext["testResults"][0]["steps"],
      failureExplanation: r.failureExplanation ?? undefined,
    })
  );

  const context: ReporterContext = {
    runId,
    projectId: run.projectId,
    trigger: run.trigger,
    mode: run.mode,
    durationMs: run.durationMs ?? 0,
    creditsConsumed: run.creditsConsumed,
    testResults,
    historicalData,
    outputFormat: "run_summary",
  };

  const prompt = buildReporterPrompt(context);

  const completion = await createCompletion({
    model,
    systemPrompt: prompt,
    messages: [
      {
        role: "user",
        content: "Generate a run summary report as JSON.",
      },
    ],
    temperature: 0.2,
    maxTokens: 4000,
  });

  const parsed = RunSummarySchema.safeParse(
    JSON.parse(completion.content)
  );

  if (!parsed.success) {
    throw new Error(
      `Failed to parse run summary: ${parsed.error.message}`
    );
  }

  const summary = parsed.data;

  // Enrich failures with analysis data
  summary.failures = summary.failures.map((failure: FailureSummary) => {
    const analysis = failureAnalyses.find(
      (a) => a.testCaseId === failure.testId
    );
    if (analysis) {
      return {
        ...failure,
        explanation: analysis.explanation,
        suggestedFix: analysis.suggestedFix,
        severity: analysis.severity,
      };
    }
    return failure;
  });

  // Update the run record with summary
  await prisma.testRun.update({
    where: { id: runId },
    data: {
      summary: summary.summary,
      passed: summary.passed,
      failed: summary.failed,
      flaky: summary.flaky,
      skipped: summary.skipped,
      totalTests: summary.totalTests,
    },
  });

  return { summary, comparison };
}

export type { HistoricalComparison, GenerateReportResult };
