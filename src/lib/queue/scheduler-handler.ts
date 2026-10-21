import type { Job } from "bullmq";
import {
  SchedulerJobDataSchema,
  type SchedulerJobData,
} from "@/lib/queue/queues";

const CONNECTION_ERROR_RE =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|Connection terminated|connection timeout/i;

/**
 * Retry once on transient connection errors. A scheduler tick that dies
 * on a stale pool connection silently skips every schedule in that
 * window — one retry with a fresh connection recovers nearly all cases.
 */
async function withConnectionRetry<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!CONNECTION_ERROR_RE.test(msg)) throw err;
    console.warn(
      `[Worker:scheduler] ${label} hit connection error, retrying once: ${msg}`
    );
    return fn();
  }
}

export async function handleSchedulerJob(
  job: Job<SchedulerJobData>
): Promise<void> {
  const data = SchedulerJobDataSchema.parse(job.data);

  console.log(`[Worker:scheduler] Processing job ${job.id}`, {
    type: data.type,
  });

  const { processScheduledRuns } = await import("@/services/scheduler");
  const triggered = await withConnectionRetry("processScheduledRuns", () =>
    processScheduledRuns()
  );
  console.log(`[Worker:scheduler] Job ${job.id} complete — triggered ${triggered} run(s)`);

  // Commit polling: check all autoSync projects for new commits
  try {
    const { pollAllProjects } = await import("@/services/github/commit-poller");
    const pollResults = await pollAllProjects();
    const synced = pollResults.filter((r) => r.status === "triggered").length;
    if (synced > 0) {
      console.log(`[Worker:scheduler] Commit poll: triggered re-index for ${synced} project(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker:scheduler] Commit poll error: ${msg}`);
  }

  // Monthly credits no invoice grants: Free resets and annual plans' later months
  try {
    const { resetDueFreeCredits, grantDueAnnualCredits } = await import("@/lib/billing/scheduled-grants");
    const reset = await resetDueFreeCredits();
    const annual = await grantDueAnnualCredits();
    if (reset + annual > 0) {
      console.log(`[Worker:scheduler] Monthly credits: ${reset} Free reset(s), ${annual} annual grant(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker:scheduler] Monthly credit grant error: ${msg}`);
  }
}
