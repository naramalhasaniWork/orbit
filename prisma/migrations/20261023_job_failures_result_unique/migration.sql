-- W4: idempotent test results (a retried run resumes) and a dead-letter table for exhausted jobs.
-- Must be applied after 20261022_preview_deployments.

-- Collapse any existing duplicate results (keep the newest) so the unique index can be built.
DELETE FROM "test_results" a
USING "test_results" b
WHERE a."test_run_id" = b."test_run_id"
  AND a."test_case_id" = b."test_case_id"
  AND (a."created_at", a."id") < (b."created_at", b."id");

-- The unique index covers lookups by test_run_id, so the plain index is redundant.
DROP INDEX IF EXISTS "test_results_test_run_id_idx";
CREATE UNIQUE INDEX "test_results_test_run_id_test_case_id_key" ON "test_results"("test_run_id", "test_case_id");

-- CreateEnum
CREATE TYPE "JobFailureStatus" AS ENUM ('open', 'retried', 'discarded');

-- CreateTable
CREATE TABLE "job_failures" (
    "id" UUID NOT NULL,
    "queue" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "stack" TEXT,
    "attempts_made" INTEGER NOT NULL,
    "run_id" UUID,
    "project_id" UUID,
    "status" "JobFailureStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,

    CONSTRAINT "job_failures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_failures_queue_job_id_key" ON "job_failures"("queue", "job_id");
CREATE INDEX "job_failures_status_created_at_idx" ON "job_failures"("status", "created_at");
