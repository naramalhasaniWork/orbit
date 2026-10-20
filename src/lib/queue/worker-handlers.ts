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
  console.log(`[Worker:execution] Processing job ${job.id}`, { runId: data.runId });

  await job.updateProgress(10);

  // Every execution job is a full run: delegate to the unified runner.
  // executeRun records its own crashes; this guards failures before it
  // starts (e.g. import).
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
