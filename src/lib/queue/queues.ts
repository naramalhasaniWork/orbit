import { Queue } from "bullmq";
import { z } from "zod";
import { getQueueConnection } from "@/lib/queue";

// ============================================================
// Job Data Schemas
// ============================================================

export const IndexingJobDataSchema = z.object({
  projectId: z.string().uuid(),
  branch: z.string(),
  changedFiles: z.array(z.string()).optional(),
  isIncremental: z.boolean(),
  phase: z.string().optional(),
});

export const ExecutionJobDataSchema = z.object({
  runId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  environmentUrl: z.string().url(),
  environmentId: z.string().uuid(),
});

export const ReportingJobDataSchema = z.object({
  runId: z.string().uuid(),
  mode: z.enum(["summary", "failure_analysis", "integration_post"]),
});

export const SchedulerJobDataSchema = z.object({
  type: z.literal("process_schedules"),
});

export type IndexingJobData = z.infer<typeof IndexingJobDataSchema>;
export type ExecutionJobData = z.infer<typeof ExecutionJobDataSchema>;
export type ReportingJobData = z.infer<typeof ReportingJobDataSchema>;
export type SchedulerJobData = z.infer<typeof SchedulerJobDataSchema>;

// ============================================================
// Queue Definitions
// ============================================================

const QUEUE_NAMES = {
  indexing: "indexing",
  execution: "execution",
  reporting: "reporting",
  scheduler: "scheduler",
} as const;

let indexingQueue: Queue<IndexingJobData> | null = null;
let executionQueue: Queue<ExecutionJobData> | null = null;
let reportingQueue: Queue<ReportingJobData> | null = null;
let schedulerQueue: Queue<SchedulerJobData> | null = null;

export function getIndexingQueue(): Queue<IndexingJobData> {
  if (!indexingQueue) {
    indexingQueue = new Queue<IndexingJobData>(QUEUE_NAMES.indexing, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return indexingQueue;
}

export function getExecutionQueue(): Queue<ExecutionJobData> {
  if (!executionQueue) {
    executionQueue = new Queue<ExecutionJobData>(QUEUE_NAMES.execution, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return executionQueue;
}

export function getReportingQueue(): Queue<ReportingJobData> {
  if (!reportingQueue) {
    reportingQueue = new Queue<ReportingJobData>(QUEUE_NAMES.reporting, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return reportingQueue;
}

export function getSchedulerQueue(): Queue<SchedulerJobData> {
  if (!schedulerQueue) {
    schedulerQueue = new Queue<SchedulerJobData>(QUEUE_NAMES.scheduler, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return schedulerQueue;
}

export { QUEUE_NAMES };
