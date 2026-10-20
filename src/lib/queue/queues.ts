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
  /** Set for event-triggered runs: after indexing, the run continues through plan → execute → report. */
  runId: z.string().uuid().optional(),
});

export const ExecutionJobDataSchema = z.object({
  runId: z.string().uuid(),
  /** Always a full run; per-case jobs were never enqueued and are no longer accepted */
  testCaseId: z.literal("__full_run__"),
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

export const PlanModeSchema = z.enum(["full", "smoke", "regression", "targeted"]);

export const PlanningJobDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plan"),
    projectId: z.string().uuid(),
    mode: PlanModeSchema,
    focusAreas: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
    maxTestCases: z.number().int().min(1).max(500).optional(),
  }),
  z.object({
    kind: z.literal("suggestions"),
    projectId: z.string().uuid(),
  }),
]);

export type IndexingJobData = z.infer<typeof IndexingJobDataSchema>;
export type ExecutionJobData = z.infer<typeof ExecutionJobDataSchema>;
export type ReportingJobData = z.infer<typeof ReportingJobDataSchema>;
export type SchedulerJobData = z.infer<typeof SchedulerJobDataSchema>;
export type PlanningJobData = z.infer<typeof PlanningJobDataSchema>;

// ============================================================
// Queue Definitions
// ============================================================

const QUEUE_NAMES = {
  indexing: "indexing",
  execution: "execution",
  reporting: "reporting",
  scheduler: "scheduler",
  planning: "planning",
} as const;

let indexingQueue: Queue<IndexingJobData> | null = null;
let executionQueue: Queue<ExecutionJobData> | null = null;
let reportingQueue: Queue<ReportingJobData> | null = null;
let schedulerQueue: Queue<SchedulerJobData> | null = null;
let planningQueue: Queue<PlanningJobData> | null = null;

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

/**
 * Plan generation and AI suggestions: long LLM calls kept off the request
 * path. Not retried automatically, since each attempt costs real tokens.
 */
export function getPlanningQueue(): Queue<PlanningJobData> {
  if (!planningQueue) {
    planningQueue = new Queue<PlanningJobData>(QUEUE_NAMES.planning, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    });
  }
  return planningQueue;
}

export { QUEUE_NAMES };
