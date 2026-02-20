import { prisma } from "@/lib/db";
import type { RunStatus, RunMode, RunTrigger } from "@/generated/prisma/client";
import { emitRunProgress, emitRunStarted, emitRunCompleted } from "@/lib/websocket";

// In-memory set of cancelled run IDs for fast checking during execution
const cancelledRuns = new Set<string>();

interface CreateRunInput {
  projectId: string;
  environmentId?: string;
  testPlanId?: string;
  mode: RunMode;
  trigger: RunTrigger;
  triggeredById?: string;
  branch?: string;
  commitSha?: string;
  prNumber?: number;
}

export async function createRun(input: CreateRunInput) {
  const run = await prisma.testRun.create({
    data: {
      projectId: input.projectId,
      environmentId: input.environmentId,
      testPlanId: input.testPlanId,
      mode: input.mode,
      trigger: input.trigger,
      triggeredById: input.triggeredById,
      branch: input.branch,
      commitSha: input.commitSha,
      prNumber: input.prNumber,
      status: "queued",
    },
  });

  await emitRunStarted(run.id, {
    runId: run.id,
    projectId: run.projectId,
    mode: run.mode,
    trigger: run.trigger,
    totalTests: 0,
  });

  return run;
}

/**
 * Request cancellation of a run. Sets both in-memory flag and DB status.
 * Pipeline phases check `isRunCancelled()` between stages.
 */
export async function cancelRun(runId: string): Promise<boolean> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) return false;

  const cancellableStatuses: RunStatus[] = ["queued", "indexing", "planning", "executing"];
  if (!cancellableStatuses.includes(run.status)) return false;

  cancelledRuns.add(runId);
  await updateRunStatus(runId, "cancelled", "Run cancelled by user");
  return true;
}

/**
 * Fast check for pipeline phases to detect cancellation.
 * Checks in-memory first, falls back to DB for distributed workers.
 */
export async function isRunCancelled(runId: string): Promise<boolean> {
  if (cancelledRuns.has(runId)) return true;

  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (run?.status === "cancelled") {
    cancelledRuns.add(runId);
    return true;
  }

  return false;
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  message?: string
) {
  const data: Record<string, unknown> = { status };

  if (status === "executing") {
    data.startedAt = new Date();
  }

  if (status === "completed" || status === "failed" || status === "cancelled") {
    data.completedAt = new Date();
    const run = await prisma.testRun.findUnique({ where: { id: runId } });
    if (run?.startedAt) {
      data.durationMs = Date.now() - run.startedAt.getTime();
    }
    // Clean up in-memory cancellation flag
    cancelledRuns.delete(runId);
  }

  const updated = await prisma.testRun.update({
    where: { id: runId },
    data,
  });

  if (status === "completed" || status === "failed" || status === "cancelled") {
    await emitRunCompleted(updated.id, {
      runId: updated.id,
      projectId: updated.projectId,
      status: status as "completed" | "failed" | "cancelled",
      totalTests: updated.totalTests,
      passed: updated.passed,
      failed: updated.failed,
      flaky: updated.flaky,
      durationMs: updated.durationMs,
    });
  } else {
    await publishRunProgress(updated.id, updated.projectId, status, message);
  }

  return updated;
}

export async function updateRunStats(runId: string) {
  const results = await prisma.testResult.groupBy({
    by: ["verdict"],
    where: { testRunId: runId },
    _count: true,
  });

  const stats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
  };

  for (const r of results) {
    stats.totalTests += r._count;
    switch (r.verdict) {
      case "pass":
        stats.passed = r._count;
        break;
      case "fail":
        stats.failed = r._count;
        break;
      case "flaky":
        stats.flaky = r._count;
        break;
      case "skipped":
        stats.skipped = r._count;
        break;
      case "healed":
        stats.passed += r._count;
        break;
    }
  }

  return prisma.testRun.update({
    where: { id: runId },
    data: stats,
  });
}

export async function getRunWithResults(runId: string) {
  return prisma.testRun.findUnique({
    where: { id: runId },
    include: {
      results: {
        include: { testCase: { select: { name: true, type: true, journey: true } } },
        orderBy: { createdAt: "asc" },
      },
      environment: { select: { name: true, url: true } },
      testPlan: { select: { version: true } },
    },
  });
}

async function publishRunProgress(
  runId: string,
  _projectId: string,
  status: RunStatus,
  message?: string
) {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { totalTests: true, passed: true, failed: true },
  });

  await emitRunProgress(runId, {
    runId,
    status,
    currentTest: message ?? "",
    totalTests: run?.totalTests ?? 0,
    passed: run?.passed ?? 0,
    failed: run?.failed ?? 0,
  });
}
