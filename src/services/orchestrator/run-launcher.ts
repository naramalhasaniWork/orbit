import { prisma } from "@/lib/db";
import type { Prisma, RunMode, RunTrigger } from "@/generated/prisma/client";
import { canConsume } from "@/lib/auth/tenant";
import { getIndexingQueue } from "@/lib/queue/queues";
import { withQueueTimeout } from "@/lib/queue/availability";
import { emitRunStarted } from "@/lib/websocket";

interface LaunchRunInput {
  projectId: string;
  mode: RunMode;
  trigger: RunTrigger;
  branch: string;
  commitSha?: string | null;
  prNumber?: number | null;
  triggeredById?: string;
  changedFiles?: string[];
  metadata?: Prisma.InputJsonValue;
}

type LaunchRunResult =
  | { ok: true; runId: string }
  | { ok: false; code: string; reason: string };

/**
 * Enqueue the first job of a freshly created run. If the queue rejects it,
 * the run row is deleted so nothing is left stuck "queued" or counted toward
 * the workspace's monthly run limit.
 */
export async function enqueueOrDiscard(
  runId: string,
  enqueue: () => Promise<unknown>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    // Bounded: BullMQ waits indefinitely for Redis instead of failing.
    await withQueueTimeout(enqueue());
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[RunLauncher] Enqueue failed for run ${runId}, discarding it:`, reason);
    await prisma.testRun.delete({ where: { id: runId } }).catch((deleteErr) => {
      console.error(`[RunLauncher] Could not discard run ${runId}:`, deleteErr);
    });
    return { ok: false, reason };
  }
}

/**
 * Start an event-triggered run (webhooks, Slack, mentions): check the
 * workspace allowance, create the run, and enqueue an indexing job carrying
 * the runId. The indexing worker hands the run to the orchestrator pipeline
 * (index → plan → execute → report), which drives it to a terminal status.
 */
export async function launchPipelineRun(input: LaunchRunInput): Promise<LaunchRunResult> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { workspaceId: true },
  });
  if (!project) return { ok: false, code: "NOT_FOUND", reason: "Project not found" };

  const allowance = await canConsume(project.workspaceId, "run");
  if (!allowance.allowed) {
    console.warn(`[RunLauncher] Run blocked for project ${input.projectId}: ${allowance.reason}`);
    return { ok: false, code: allowance.code, reason: allowance.reason };
  }

  const changedFiles = input.changedFiles?.slice(0, 100);
  const run = await prisma.testRun.create({
    data: {
      projectId: input.projectId,
      status: "queued",
      mode: input.mode,
      trigger: input.trigger,
      branch: input.branch,
      commitSha: input.commitSha ?? null,
      prNumber: input.prNumber ?? null,
      triggeredById: input.triggeredById,
      metadata: input.metadata ?? {},
    },
  });

  const enqueued = await enqueueOrDiscard(run.id, () =>
    getIndexingQueue().add(
      `run-${run.id}`,
      {
        projectId: input.projectId,
        branch: input.branch,
        changedFiles,
        isIncremental: !!changedFiles && changedFiles.length > 0,
        runId: run.id,
      },
      { jobId: `run-${run.id}` }
    )
  );
  if (!enqueued.ok) {
    return { ok: false, code: "QUEUE_UNAVAILABLE", reason: `Run queue unavailable: ${enqueued.reason}` };
  }

  await emitRunStarted(run.id, {
    runId: run.id,
    projectId: input.projectId,
    mode: input.mode,
    trigger: input.trigger,
    totalTests: 0,
  });

  return { ok: true, runId: run.id };
}

/** Response fields for webhook replies: the run id, or why no run started. */
export function launchSummary(result: LaunchRunResult): Record<string, string> {
  return result.ok
    ? { runId: result.runId }
    : { runBlocked: result.code, reason: result.reason };
}

export type { LaunchRunInput, LaunchRunResult };
