import type { Job, Queue } from "bullmq";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  QUEUE_NAMES,
  getIndexingQueue,
  getExecutionQueue,
  getReportingQueue,
  getPlanningQueue,
} from "@/lib/queue/queues";
import { markRunFailed } from "@/lib/queue/run-job-guards";

/** Queues whose exhausted jobs are kept for inspection. The scheduler tick fires every minute and is not worth keeping. */
const DEAD_LETTER_QUEUES = [
  QUEUE_NAMES.indexing,
  QUEUE_NAMES.execution,
  QUEUE_NAMES.reporting,
  QUEUE_NAMES.planning,
] as const;

const MAX_ERROR_CHARS = 4000;

function queueFor(name: string): Queue {
  switch (name) {
    case QUEUE_NAMES.indexing: return getIndexingQueue() as Queue;
    case QUEUE_NAMES.execution: return getExecutionQueue() as Queue;
    case QUEUE_NAMES.reporting: return getReportingQueue() as Queue;
    case QUEUE_NAMES.planning: return getPlanningQueue() as Queue;
    default: throw new Error(`Unknown queue: ${name}`);
  }
}

function field(data: unknown, key: string): string | null {
  const v = (data as Record<string, unknown> | null)?.[key];
  return typeof v === "string" ? v : null;
}

/** True once BullMQ will not retry this job again. */
export function isFinalFailure(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  return job.attemptsMade >= (job.opts?.attempts ?? 1);
}

/**
 * Failed-event hook: when a job has used all its attempts, persist it to the
 * JobFailure table and make sure a run it belonged to ends in a terminal state.
 */
export async function recordJobFailure(
  queueName: string,
  job: Job | undefined,
  err: Error
): Promise<void> {
  if (!job || !isFinalFailure(job)) return;
  if (!(DEAD_LETTER_QUEUES as readonly string[]).includes(queueName)) return;

  const runId = field(job.data, "runId");
  if (runId) await markRunFailed(runId, `Job ${queueName}:${job.id} failed: ${err.message}`);

  const fields = {
    jobName: job.name,
    data: (job.data ?? {}) as Prisma.InputJsonValue,
    error: err.message.slice(0, MAX_ERROR_CHARS),
    stack: err.stack?.slice(0, MAX_ERROR_CHARS) ?? null,
    attemptsMade: job.attemptsMade,
    runId,
    projectId: field(job.data, "projectId"),
    status: "open" as const,
    resolvedAt: null,
    resolvedBy: null,
  };
  try {
    await prisma.jobFailure.upsert({
      where: { queue_jobId: { queue: queueName, jobId: job.id ?? "unknown" } },
      create: { queue: queueName, jobId: job.id ?? "unknown", ...fields },
      update: fields,
    });
  } catch (dbErr) {
    console.error(`[DLQ] Could not record failure for ${queueName}:${job.id}:`, dbErr);
  }
}

export type RetryOutcome = { ok: true; jobId: string } | { ok: false; code: "NOT_FOUND" | "NOT_OPEN"; reason: string };

/** Re-enqueue a dead-lettered job under a fresh id (the old one may still sit in the failed set). */
export async function retryJobFailure(id: string, userId: string): Promise<RetryOutcome> {
  const failure = await prisma.jobFailure.findUnique({ where: { id } });
  if (!failure) return { ok: false, code: "NOT_FOUND", reason: "Job failure not found" };
  if (failure.status !== "open") {
    return { ok: false, code: "NOT_OPEN", reason: `Job failure already ${failure.status}` };
  }

  // Claim first so a double click can't enqueue twice.
  const claim = await prisma.jobFailure.updateMany({
    where: { id, status: "open" },
    data: { status: "retried", resolvedAt: new Date(), resolvedBy: userId },
  });
  if (claim.count === 0) return { ok: false, code: "NOT_OPEN", reason: "Job failure already resolved" };

  if (failure.runId) {
    // The run was force-failed when the job died; let the pipeline drive it again.
    await prisma.testRun.updateMany({
      where: { id: failure.runId, status: "failed" },
      data: { status: "queued", summary: null, completedAt: null },
    });
  }

  const jobId = `${failure.jobId}:retry:${failure.id.slice(0, 8)}`;
  try {
    await queueFor(failure.queue).add(failure.jobName, failure.data as object, { jobId });
  } catch (err) {
    await prisma.jobFailure.update({
      where: { id },
      data: { status: "open", resolvedAt: null, resolvedBy: null },
    });
    throw err;
  }
  return { ok: true, jobId };
}

export async function discardJobFailure(id: string, userId: string): Promise<boolean> {
  const { count } = await prisma.jobFailure.updateMany({
    where: { id, status: "open" },
    data: { status: "discarded", resolvedAt: new Date(), resolvedBy: userId },
  });
  return count > 0;
}
