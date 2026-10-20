import type { Job } from "bullmq";
import {
  IndexingJobDataSchema,
  ExecutionJobDataSchema,
  ReportingJobDataSchema,
  type IndexingJobData,
  type ExecutionJobData,
  type ReportingJobData,
} from "@/lib/queue/queues";
import {
  emitRunCompleted,
  emitTestCompleted,
  emitIndexingProgress,
  emitIndexingFailed,
} from "@/lib/websocket";
import { runPipelineForJob, markRunFailed, errorMessage } from "@/lib/queue/run-job-guards";

export async function handleIndexingJob(job: Job<IndexingJobData>): Promise<void> {
  const data = IndexingJobDataSchema.parse(job.data);
  console.log(`[Worker:indexing] Processing job ${job.id}`, {
    projectId: data.projectId,
    branch: data.branch,
    isIncremental: data.isIncremental,
  });

  await job.updateProgress(10);

  // Event-triggered run: the orchestrator owns indexing → planning →
  // execution → reporting and the run's terminal status. Not retried by the
  // queue, since a retry would repeat phases on a run already marked failed.
  if (data.runId) {
    await runPipelineForJob(data.runId, data.changedFiles);
    await job.updateProgress(100);
    return;
  }

  try {
    if (data.isIncremental && data.changedFiles && data.changedFiles.length > 0) {
      const { runIncrementalIndex } = await import("@/services/indexing/incremental");
      await runIncrementalIndex(data.projectId, data.branch, data.changedFiles);
    } else {
      const { runIndexingPipeline } = await import("@/services/indexing/pipeline");
      await runIndexingPipeline(data.projectId, data.branch);
    }

    const { prisma } = await import("@/lib/db");
    await prisma.project.update({
      where: { id: data.projectId },
      data: { lastIndexedAt: new Date() },
    });

    await emitIndexingProgress(data.projectId, {
      projectId: data.projectId,
      phase: "complete",
      message: "Indexing complete",
      nodesFound: 0,
      progress: 100,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker:indexing] Pipeline failed for ${data.projectId}:`, errorMsg);

    await emitIndexingProgress(data.projectId, {
      projectId: data.projectId,
      phase: "error",
      message: `Indexing failed: ${errorMsg}`,
      nodesFound: 0,
      progress: -1,
    });

    await emitIndexingFailed(data.projectId, {
      projectId: data.projectId,
      error: errorMsg,
      phase: data.phase ?? "unknown",
    });

    throw err;
  }

  await job.updateProgress(100);
}

export async function handleExecutionJob(job: Job<ExecutionJobData>): Promise<void> {
  const data = ExecutionJobDataSchema.parse(job.data);
  console.log(`[Worker:execution] Processing job ${job.id}`, {
    runId: data.runId,
    testCaseId: data.testCaseId,
  });

  await job.updateProgress(10);

  // Full-run execution: delegate to the unified runner. executeRun records
  // its own crashes; this guards failures before it starts (e.g. import).
  if (data.testCaseId === "__full_run__") {
    try {
      const runnerModule = await import("@/services/execution/runner");
      await runnerModule.executeRun({ runId: data.runId, environmentId: data.environmentId });
    } catch (importErr) {
      const msg = importErr instanceof Error
        ? `${importErr.name}: ${importErr.message}\n${importErr.stack}`
        : String(importErr);
      console.error(`[Worker:execution] Runner import/execute failed:\n${msg}`);
      await markRunFailed(data.runId, `Execution could not start: ${errorMessage(importErr)}`);
    }
    await job.updateProgress(100);
    return;
  }

  const { prisma } = await import("@/lib/db");

  try {
    const testCase = await prisma.testCase.findUniqueOrThrow({
      where: { id: data.testCaseId },
    });

    const credentials = await loadCredentials(data.environmentId);

    const { executeTestCase } = await import("@/services/execution/test-case-executor");

    const result = await executeTestCase(
      data.runId,
      {
        id: testCase.id,
        name: testCase.name,
        steps: testCase.steps as Array<{
          action: string;
          expected: string;
          selector?: string;
        }>,
        projectId: testCase.projectId,
        isCritical: testCase.isCritical,
      },
      data.environmentUrl,
      credentials
    );

    await prisma.testResult.create({
      data: {
        testRunId: data.runId,
        testCaseId: data.testCaseId,
        verdict: result.verdict as "pass" | "fail" | "flaky" | "skipped" | "healed",
        durationMs: result.durationMs,
        steps: JSON.parse(JSON.stringify(result.steps)),
        artifacts: JSON.parse(JSON.stringify(result.artifacts)),
        healedSelectors: JSON.parse(JSON.stringify(result.healedSelectors)),
      },
    });

    await prisma.testCase.update({
      where: { id: data.testCaseId },
      data: {
        lastVerdict: result.verdict as "pass" | "fail" | "flaky" | "skipped" | "healed",
        lastRunAt: new Date(),
      },
    });

    await emitTestCompleted(data.runId, {
      runId: data.runId,
      testCaseId: data.testCaseId,
      testCaseName: testCase.name,
      verdict: result.verdict as "pass" | "fail" | "flaky" | "skipped" | "healed",
      durationMs: result.durationMs,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker:execution] Test ${data.testCaseId} failed:`, errorMsg);

    await prisma.testResult.create({
      data: {
        testRunId: data.runId,
        testCaseId: data.testCaseId,
        verdict: "fail",
        durationMs: 0,
        steps: [
          {
            stepIndex: 0,
            action: "worker_execution",
            expected: "Test completes",
            actual: `Worker error: ${errorMsg}`,
            status: "failed",
            durationMs: 0,
          },
        ],
        artifacts: {},
        healedSelectors: [],
      },
    });

    const testCase = await prisma.testCase.findUnique({
      where: { id: data.testCaseId },
      select: { name: true },
    });

    await emitTestCompleted(data.runId, {
      runId: data.runId,
      testCaseId: data.testCaseId,
      testCaseName: testCase?.name ?? "Unknown",
      verdict: "fail",
      durationMs: 0,
    });

    throw err;
  }

  await job.updateProgress(100);
}

export async function handleReportingJob(job: Job<ReportingJobData>): Promise<void> {
  const data = ReportingJobDataSchema.parse(job.data);
  console.log(`[Worker:reporting] Processing job ${job.id}`, {
    runId: data.runId,
    mode: data.mode,
  });

  await job.updateProgress(10);

  try {
    switch (data.mode) {
      case "failure_analysis": {
        const { analyzeFailures } = await import("@/services/reporting/failure-analyzer");
        await analyzeFailures(data.runId);
        break;
      }
      case "summary":
      case "integration_post": {
        const { runReportingPipeline } = await import("@/services/reporting/reporter");
        await runReportingPipeline(data.runId);
        break;
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker:reporting] Reporting failed for run ${data.runId}:`, errorMsg);

    const { prisma } = await import("@/lib/db");
    await prisma.testRun.update({
      where: { id: data.runId },
      data: { summary: `Reporting failed: ${errorMsg}` },
    });

    throw err;
  }

  const { prisma } = await import("@/lib/db");
  const completedRun = await prisma.testRun.findUnique({
    where: { id: data.runId },
    select: {
      projectId: true,
      status: true,
      totalTests: true,
      passed: true,
      failed: true,
      flaky: true,
      durationMs: true,
    },
  });

  await emitRunCompleted(data.runId, {
    runId: data.runId,
    projectId: completedRun?.projectId ?? "",
    status: (completedRun?.status as "completed" | "failed" | "cancelled") ?? "completed",
    totalTests: completedRun?.totalTests ?? 0,
    passed: completedRun?.passed ?? 0,
    failed: completedRun?.failed ?? 0,
    flaky: completedRun?.flaky ?? 0,
    durationMs: completedRun?.durationMs ?? null,
  });

  await job.updateProgress(100);
}

async function loadCredentials(environmentId: string): Promise<Record<string, string>> {
  const { prisma } = await import("@/lib/db");
  const { decrypt } = await import("@/lib/vault");

  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { id: true, projectId: true },
  });

  if (!environment) return {};

  const secrets = await prisma.secret.findMany({
    where: {
      projectId: environment.projectId,
      OR: [{ environmentId: environment.id }, { environmentId: null }],
    },
  });

  const credentials: Record<string, string> = {};
  for (const secret of secrets) {
    try {
      credentials[secret.key] = decrypt(secret.encryptedValue, secret.iv);
    } catch {
      console.warn(`[Worker:execution] Failed to decrypt secret "${secret.key}"`);
    }
  }

  return credentials;
}
