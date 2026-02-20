import { Worker } from "bullmq";
import { getQueueConnection } from "@/lib/queue";
import {
  QUEUE_NAMES,
  type IndexingJobData,
  type ExecutionJobData,
  type ReportingJobData,
} from "@/lib/queue/queues";
import {
  handleIndexingJob,
  handleExecutionJob,
  handleReportingJob,
} from "@/lib/queue/worker-handlers";

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

  const workers = [indexingWorker, executionWorker, reportingWorker];

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

  console.log("[Workers] All workers registered");
}

export async function shutdownWorkers(): Promise<void> {
  console.log("[Workers] Shutting down...");
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers.length = 0;
  console.log("[Workers] All workers shut down");
}
