-- Compile-and-replay: TestResult execution instrumentation (mode, model calls, cost,
-- divergence step) and the TestScript table holding compiled replay scripts.
-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('agent', 'replay', 'replay_healed');

-- CreateEnum
CREATE TYPE "TestScriptStatus" AS ENUM ('active', 'suspect', 'retired');

-- AlterTable
ALTER TABLE "test_results" ADD COLUMN     "diverged_at_step" INTEGER,
ADD COLUMN     "execution_mode" "ExecutionMode" NOT NULL DEFAULT 'agent',
ADD COLUMN     "model_calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "model_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "test_scripts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TestScriptStatus" NOT NULL DEFAULT 'active',
    "steps_hash" TEXT NOT NULL,
    "env_key" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "covered_routes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "covered_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_run_id" UUID,
    "source_commit_sha" TEXT,
    "replay_count" INTEGER NOT NULL DEFAULT 0,
    "divergence_count" INTEGER NOT NULL DEFAULT 0,
    "last_verified_by_agent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_scripts_test_case_id_env_key_status_idx" ON "test_scripts"("test_case_id", "env_key", "status");

-- CreateIndex
CREATE INDEX "test_scripts_project_id_status_idx" ON "test_scripts"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_scripts_covered_node_ids_idx" ON "test_scripts" USING GIN ("covered_node_ids");

-- CreateIndex
CREATE UNIQUE INDEX "test_scripts_test_case_id_env_key_version_key" ON "test_scripts"("test_case_id", "env_key", "version");

-- CreateIndex
CREATE INDEX "test_results_execution_mode_created_at_idx" ON "test_results"("execution_mode", "created_at");

-- AddForeignKey
ALTER TABLE "test_scripts" ADD CONSTRAINT "test_scripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_scripts" ADD CONSTRAINT "test_scripts_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

