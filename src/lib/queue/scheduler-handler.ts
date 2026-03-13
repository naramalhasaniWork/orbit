import type { Job } from "bullmq";
import {
  SchedulerJobDataSchema,
  type SchedulerJobData,
} from "@/lib/queue/queues";

export async function handleSchedulerJob(
  job: Job<SchedulerJobData>
): Promise<void> {
  const data = SchedulerJobDataSchema.parse(job.data);

  console.log(`[Worker:scheduler] Processing job ${job.id}`, {
    type: data.type,
  });

  const { processScheduledRuns } = await import("@/services/scheduler");
  const triggered = await processScheduledRuns();
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
}
