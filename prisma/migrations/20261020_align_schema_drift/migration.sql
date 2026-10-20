-- Brings a database built from the migration history in line with schema.prisma.
-- These objects were previously applied out-of-band (db push / runtime ALTER),
-- so every statement is idempotent: databases that already have them are unaffected.

-- AlterEnum
ALTER TYPE "TestType" ADD VALUE IF NOT EXISTS 'operational_flow';
ALTER TYPE "TestType" ADD VALUE IF NOT EXISTS 'prerequisite_chain';

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "messages" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "environments" ADD COLUMN IF NOT EXISTS "default_run_mode" TEXT NOT NULL DEFAULT 'full';
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "required_role" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "github_installations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "installation_id" INTEGER NOT NULL,
    "account_login" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "github_installations_workspace_id_idx" ON "github_installations"("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "github_installations_workspace_id_installation_id_key" ON "github_installations"("workspace_id", "installation_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_installations_workspace_id_fkey') THEN
        ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
