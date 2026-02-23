import { prisma } from "@/lib/db";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { parseLlmJson } from "@/lib/utils/json-parse";
import {
  buildReporterPrompt,
  type ReporterContext,
} from "@/agents/prompts/reporter-prompt";
import {
  BugReportSchema,
  type BugReport,
} from "@/agents/schemas/run-summary";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface FailureAnalysis {
  testResultId: string;
  testCaseId: string;
  testName: string;
  explanation: string;
  suggestedFix: string;
  severity: Severity;
}

interface AnalyzeFailuresResult {
  analyses: FailureAnalysis[];
  totalAnalyzed: number;
}

export async function getHistoricalData(
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

export async function analyzeFailures(
  runId: string
): Promise<AnalyzeFailuresResult> {
  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      project: { select: { workspaceId: true } },
      results: {
        where: { verdict: "fail" },
        include: { testCase: true },
      },
    },
  });

  if (run.results.length === 0) {
    return { analyses: [], totalAnalyzed: 0 };
  }

  const historicalData = await getHistoricalData(run.projectId);
  const model = await getModelForTask("failure_analysis");
  const analyses: FailureAnalysis[] = [];

  for (const result of run.results) {
    const context: ReporterContext = {
      runId,
      projectId: run.projectId,
      trigger: run.trigger,
      mode: run.mode,
      durationMs: run.durationMs ?? 0,
      creditsConsumed: run.creditsConsumed,
      testResults: [
        {
          testId: result.testCaseId,
          testName: result.testCase.name,
          verdict: result.verdict,
          durationMs: result.durationMs ?? 0,
          steps: result.steps as ReporterContext["testResults"][0]["steps"],
          failureExplanation: result.failureExplanation ?? undefined,
        },
      ],
      historicalData,
      outputFormat: "bug_report",
    };

    const prompt = buildReporterPrompt(context);

    const completion = await createTrackedCompletion(
      {
        model,
        systemPrompt: prompt,
        messages: [
          {
            role: "user",
            content:
              "Analyze this test failure and generate a bug report as JSON.",
          },
        ],
        temperature: 0.2,
        maxTokens: 2000,
      },
      {
        workspaceId: run.project.workspaceId,
        projectId: run.projectId,
        runId,
        agentPhase: "reporter",
      }
    );

    const parsed = BugReportSchema.safeParse(parseLlmJson(completion.content));

    if (parsed.success) {
      const bugReport: BugReport = parsed.data;
      const analysis: FailureAnalysis = {
        testResultId: result.id,
        testCaseId: result.testCaseId,
        testName: result.testCase.name,
        explanation: bugReport.description,
        suggestedFix: bugReport.suggestedFix ?? "",
        severity: bugReport.severity,
      };

      await prisma.testResult.update({
        where: { id: result.id },
        data: {
          failureExplanation: analysis.explanation,
          suggestedFix: analysis.suggestedFix,
        },
      });

      analyses.push(analysis);
    }
  }

  return { analyses, totalAnalyzed: analyses.length };
}

export type { FailureAnalysis, AnalyzeFailuresResult };
