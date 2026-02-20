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

  const { processScheduledRuns } = await import(
    "@/services/scheduler"
  );

  const triggered = await processScheduledRuns();

  console.log(
    `[Worker:scheduler] Job ${job.id} complete — triggered ${triggered} run(s)`
  );
}
