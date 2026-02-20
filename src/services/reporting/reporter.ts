import { prisma } from "@/lib/db";
import { analyzeFailures } from "@/services/reporting/failure-analyzer";
import {
  generateReport as generateRunReport,
  type GenerateReportResult,
} from "@/services/reporting/report-generator";
import { postPRComment, createCheckRun } from "@/services/reporting/integrations/github";
import { createBugIssue } from "@/services/reporting/integrations/linear";
import {
  sendRunNotification,
  sendFailureAlert,
} from "@/services/reporting/integrations/slack";
import { BugReportSchema, type BugReport } from "@/agents/schemas/run-summary";
import { createCompletion } from "@/lib/ai";
import { getModelForTask } from "@/lib/ai/model-router";
import {
  buildReporterPrompt,
  type ReporterContext,
} from "@/agents/prompts/reporter-prompt";

interface IntegrationResults {
  github: { prComment: boolean; checkRun: boolean };
  linear: { issuesCreated: number };
  slack: { notification: boolean; alerts: number };
}

interface ReportingPipelineResult {
  runId: string;
  report: GenerateReportResult;
  integrations: IntegrationResults;
}

async function getRunHistoricalData(
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

async function generateBugReport(
  runId: string,
  projectId: string,
  result: {
    testCaseId: string;
    testName: string;
    durationMs: number;
    steps: ReporterContext["testResults"][0]["steps"];
    failureExplanation: string | null;
  },
  trigger: ReporterContext["trigger"],
  mode: ReporterContext["mode"]
): Promise<BugReport | null> {
  const historicalData = await getRunHistoricalData(projectId);
  const model = getModelForTask("failure_analysis");

  const context: ReporterContext = {
    runId,
    projectId,
    trigger,
    mode,
    durationMs: 0,
    creditsConsumed: 0,
    testResults: [
      {
        testId: result.testCaseId,
        testName: result.testName,
        verdict: "fail",
        durationMs: result.durationMs,
        steps: result.steps,
        failureExplanation: result.failureExplanation ?? undefined,
      },
    ],
    historicalData,
    outputFormat: "bug_report",
  };

  const prompt = buildReporterPrompt(context);
  const completion = await createCompletion({
    model,
    systemPrompt: prompt,
    messages: [
      {
        role: "user",
        content: "Generate a bug report for this test failure as JSON.",
      },
    ],
    temperature: 0.2,
    maxTokens: 2000,
  });

  const parsed = BugReportSchema.safeParse(JSON.parse(completion.content));
  return parsed.success ? parsed.data : null;
}

async function triggerIntegrations(
  report: GenerateReportResult,
  run: {
    id: string;
    projectId: string;
    prNumber: number | null;
    commitSha: string | null;
    trigger: string;
    mode: string;
  }
): Promise<IntegrationResults> {
  const results: IntegrationResults = {
    github: { prComment: false, checkRun: false },
    linear: { issuesCreated: 0 },
    slack: { notification: false, alerts: 0 },
  };

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: run.projectId },
    select: { settings: true },
  });

  const settings = project.settings as Record<string, unknown>;

  // GitHub integrations
  if (run.prNumber) {
    const prResult = await postPRComment(run.prNumber, report.summary, run.projectId);
    results.github.prComment = prResult.success;
  }

  if (run.commitSha) {
    const checkResult = await createCheckRun(run.commitSha, report.summary, run.projectId);
    results.github.checkRun = checkResult.success;
  }

  // Linear: create bug issues for critical/high severity failures
  const criticalFailures = report.summary.failures.filter(
    (f) => f.severity === "critical" || f.severity === "high"
  );

  for (const failure of criticalFailures) {
    const failedResult = await prisma.testResult.findFirst({
      where: {
        testRunId: run.id,
        testCaseId: failure.testId,
        verdict: "fail",
      },
      include: { testCase: { select: { name: true } } },
    });

    if (!failedResult) continue;

    const bugReport = await generateBugReport(
      run.id,
      run.projectId,
      {
        testCaseId: failedResult.testCaseId,
        testName: failedResult.testCase.name,
        durationMs: failedResult.durationMs ?? 0,
        steps: failedResult.steps as ReporterContext["testResults"][0]["steps"],
        failureExplanation: failedResult.failureExplanation,
      },
      run.trigger as ReporterContext["trigger"],
      run.mode as ReporterContext["mode"]
    );

    if (bugReport) {
      const issueResult = await createBugIssue(bugReport, run.projectId);
      if (issueResult.success) {
        results.linear.issuesCreated++;
      }
    }
  }

  // Slack: send run notification via webhook
  const slackWebhookUrl =
    (settings?.slackWebhookUrl as string | undefined) ??
    (settings?.slackChannelId as string | undefined);
  if (slackWebhookUrl) {
    const notifResult = await sendRunNotification(
      slackWebhookUrl,
      report.summary
    );
    results.slack.notification = notifResult.success;

    // Send individual alerts for critical failures
    for (const failure of criticalFailures) {
      const alertResult = await sendFailureAlert(slackWebhookUrl, failure);
      if (alertResult.success) {
        results.slack.alerts++;
      }
    }
  }

  return results;
}

export async function runReportingPipeline(
  runId: string
): Promise<ReportingPipelineResult> {
  // Update run status to reporting
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "reporting" },
  });

  // Step 1: Analyze all failures
  const { analyses } = await analyzeFailures(runId);

  // Step 2: Generate run summary report
  const report = await generateRunReport(runId, analyses);

  // Step 3: Load run metadata for integration triggers
  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: {
      id: true,
      projectId: true,
      prNumber: true,
      commitSha: true,
      trigger: true,
      mode: true,
    },
  });

  // Step 4: Trigger integrations
  const integrations = await triggerIntegrations(report, run);

  // Step 5: Mark run as completed
  await prisma.testRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });

  return { runId, report, integrations };
}

/**
 * Alias for orchestrator compatibility.
 * The orchestrator pipeline calls `generateReport(runId)`.
 */
export { runReportingPipeline as generateReport };

export type { ReportingPipelineResult, IntegrationResults };
