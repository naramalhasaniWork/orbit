import { prisma } from "@/lib/db";
import { openSecret } from "@/lib/integrations/secret-field";
import { analyzeFailures, getHistoricalData } from "@/services/reporting/failure-analyzer";
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
import {
  dispatchRunCompleted,
  dispatchTestFailed,
  dispatchBugDiscovered,
} from "@/services/reporting/integrations/outbound-webhooks";
import { BugReportSchema, type BugReport } from "@/agents/schemas/run-summary";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";
import { parseLlmJson } from "@/lib/utils/json-parse";
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
  const [historicalData, project] = await Promise.all([
    getHistoricalData(projectId),
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { workspaceId: true },
    }),
  ]);
  const model = await getModelForTask("failure_analysis");

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
  const completion = await createTrackedCompletion(
    {
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
    },
    {
      workspaceId: project.workspaceId,
      projectId,
      runId,
      agentPhase: "reporter",
    }
  );

  const parsed = BugReportSchema.safeParse(parseLlmJson(completion.content));
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
    select: { settings: true, workspace: { select: { settings: true } } },
  });

  const settings = project.settings as Record<string, unknown>;
  const workspaceSettings = (project.workspace.settings ?? {}) as Record<string, unknown>;
  const linearPrefs = workspaceSettings.linear as { autoCreateIssues?: boolean } | undefined;
  const slackPrefs = workspaceSettings.slack as
    | { notifications?: { runCompleted?: boolean; testFailed?: boolean } }
    | undefined;

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

  // Workspace-level "Auto-create issues" toggle; unset keeps the existing behaviour.
  const issuesEnabled = linearPrefs?.autoCreateIssues !== false;

  for (const failure of issuesEnabled ? criticalFailures : []) {
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
        await dispatchBugDiscovered(run.projectId, {
          issueId: issueResult.issueId,
          issueUrl: issueResult.issueUrl,
          title: issueResult.title,
          severity: bugReport.severity,
        });
      }
    }
  }

  // Slack: send run notification via webhook
  // Sealed by the Settings route; legacy plaintext values still open
  const slackWebhookUrl =
    openSecret(settings?.slackWebhookUrl) ?? openSecret(workspaceSettings.slackWebhookUrl);
  if (slackWebhookUrl) {
    if (slackPrefs?.notifications?.runCompleted !== false) {
      const notifResult = await sendRunNotification(
        slackWebhookUrl,
        report.summary
      );
      results.slack.notification = notifResult.success;
    }

    // Send individual alerts for critical failures
    const alertFailures =
      slackPrefs?.notifications?.testFailed === false ? [] : criticalFailures;
    for (const failure of alertFailures) {
      const alertResult = await sendFailureAlert(slackWebhookUrl, failure, run.projectId);
      if (alertResult.success) {
        results.slack.alerts++;
      }
    }
  }

  // Outbound webhooks: dispatch run.completed and test.failed events
  await dispatchRunCompleted(run.projectId, report.summary);

  for (const failure of report.summary.failures) {
    await dispatchTestFailed(run.projectId, failure);
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
