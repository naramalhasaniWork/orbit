import { Worker } from "bullmq";
import { getQueueConnection } from "@/lib/queue";
import {
  QUEUE_NAMES,
  getSchedulerQueue,
  getPreviewQueue,
  type IndexingJobData,
  type ExecutionJobData,
  type ReportingJobData,
  type SchedulerJobData,
  type PlanningJobData,
  type PreviewJobData,
} from "@/lib/queue/queues";
import {
  handleIndexingJob,
  handleExecutionJob,
  handleReportingJob,
} from "@/lib/queue/worker-handlers";
import { handleSchedulerJob } from "@/lib/queue/scheduler-handler";
import { handlePlanningJob } from "@/lib/queue/planning-handler";

const activeWorkers: Worker[] = [];

export function registerWorkers(): void {
  const connection = getQueueConnection();

  const indexingWorker = new Worker<IndexingJobData>(
    QUEUE_NAMES.indexing,
    handleIndexingJob,
    { connection, concurrency: 2 }
  );

  const executionWorker = new Worker<ExecutionJobData>(
    QUEUE_NAMES.execution,
    handleExecutionJob,
    { connection, concurrency: 5 }
  );

  const reportingWorker = new Worker<ReportingJobData>(
    QUEUE_NAMES.reporting,
    handleReportingJob,
    { connection, concurrency: 3 }
  );

  const schedulerWorker = new Worker<SchedulerJobData>(
    QUEUE_NAMES.scheduler,
    handleSchedulerJob,
    { connection, concurrency: 1 }
  );

  const planningWorker = new Worker<PlanningJobData>(
    QUEUE_NAMES.planning,
    handlePlanningJob,
    { connection, concurrency: 2 }
  );

  const previewWorker = new Worker<PreviewJobData>(
    QUEUE_NAMES.preview,
    async () => {
      const { reconcilePreviews } = await import("@/services/preview/reconcile");
      const result = await reconcilePreviews();
      if (result.changed > 0) console.log(`[Worker:preview] ${result.changed}/${result.checked} preview(s) moved on`);
    },
    { connection, concurrency: 1 }
  );

  const workers = [indexingWorker, executionWorker, reportingWorker, schedulerWorker, planningWorker, previewWorker];

  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      console.log(`[Worker:${worker.name}] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
      console.error(
        `[Worker:${worker.name}] Job ${job?.id} failed:`,
        err.message
      );
    });

    worker.on("error", (err) => {
      console.error(`[Worker:${worker.name}] Error:`, err.message);
    });

    activeWorkers.push(worker);
  });

  // Register the repeatable scheduler job (every 60 seconds)
  registerSchedulerRepeatable().catch((err) => {
    console.error("[Workers] Failed to register scheduler repeatable:", err.message);
  });

  registerPreviewRepeatable().catch((err) => {
    console.error("[Workers] Failed to register preview reconcile repeatable:", err.message);
  });

  console.log("[Workers] All workers registered");
}

/** Re-resolve pending PR previews every 2 minutes (and time them out after 15). */
async function registerPreviewRepeatable(): Promise<void> {
  await getPreviewQueue().upsertJobScheduler(
    "preview-reconcile",
    { every: 120_000 },
    { name: "reconcile_previews", data: { type: "reconcile_previews" as const } }
  );
}

async function registerSchedulerRepeatable(): Promise<void> {
  const queue = getSchedulerQueue();

  await queue.upsertJobScheduler(
    "scheduler-tick",
    { every: 60_000 },
    {
      name: "process_schedules",
      data: { type: "process_schedules" as const },
    }
  );

  console.log("[Workers] Scheduler repeatable job registered (every 60s)");
}

export async function shutdownWorkers(): Promise<void> {
  console.log("[Workers] Shutting down...");
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers.length = 0;
  console.log("[Workers] All workers shut down");
}
