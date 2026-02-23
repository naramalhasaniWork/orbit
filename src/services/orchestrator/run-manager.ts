import { prisma } from "@/lib/db";
import type { RunStatus, RunMode, RunTrigger } from "@/generated/prisma/client";
import { emitRunProgress, emitRunStarted, emitRunCompleted } from "@/lib/websocket";
import { getRedis } from "@/lib/redis";

// Redis key TTL for cancellation flags — 2 hours covers any realistic run
const CANCEL_KEY_TTL_SECONDS = 7200;

function cancelKey(runId: string): string {
  return `orbit:run:cancelled:${runId}`;
}

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
 * Request cancellation of a run. Writes to Redis so all workers see it
 * immediately, then updates the DB status.
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

  // Write to Redis so all workers see the cancellation immediately
  try {
    await getRedis().set(cancelKey(runId), "1", "EX", CANCEL_KEY_TTL_SECONDS);
  } catch (err) {
    console.error(`[RunManager] Failed to write cancel flag to Redis for ${runId}:`, err);
  }

  await updateRunStatus(runId, "cancelled", "Run cancelled by user");
  return true;
}

/**
 * Fast check for pipeline phases to detect cancellation.
 * Checks Redis first (visible to all workers), falls back to DB.
 */
export async function isRunCancelled(runId: string): Promise<boolean> {
  try {
    const flag = await getRedis().get(cancelKey(runId));
    if (flag) return true;
  } catch {
    // Redis unavailable — fall through to DB check
  }

  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  return run?.status === "cancelled";
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
    // Clean up Redis cancellation flag
    try {
      await getRedis().del(cancelKey(runId));
    } catch {
      // Non-critical — key will expire on its own
    }
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
