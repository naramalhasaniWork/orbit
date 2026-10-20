-- W3: typed integration config, webhook endpoints and project notes.
-- Data moves from the settings JSON in prisma/backfills/20261025_integrations.ts;
-- the old keys and IntegrationConfig.config/credentials stay until a later release.

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('connected', 'disconnected', 'error');

-- AlterTable: typed columns beside the deprecated config/credentials JSON
ALTER TABLE "integration_configs" ADD COLUMN     "credentials_sealed" JSONB,
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "external_account_id" TEXT,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "status" "IntegrationStatus" NOT NULL DEFAULT 'connected',
ADD COLUMN     "inbound_token_hash" TEXT;

-- Inbound routing: Slack commands by bound team id, Linear/Slack inbound tokens by hash
CREATE INDEX "integration_configs_provider_external_account_id_idx" ON "integration_configs"("provider", "external_account_id");
CREATE INDEX "integration_configs_inbound_token_hash_idx" ON "integration_configs"("inbound_token_hash");

-- Repurpose the never-read webhook_subscriptions table as webhook_endpoints.
-- Its plaintext `secret` and `description` go: no code ever dispatched to these rows.
ALTER TABLE "webhook_subscriptions" RENAME TO "webhook_endpoints";
ALTER TABLE "webhook_endpoints" RENAME CONSTRAINT "webhook_subscriptions_pkey" TO "webhook_endpoints_pkey";
ALTER TABLE "webhook_endpoints" RENAME CONSTRAINT "webhook_subscriptions_workspace_id_fkey" TO "webhook_endpoints_workspace_id_fkey";
ALTER INDEX "webhook_subscriptions_workspace_id_idx" RENAME TO "webhook_endpoints_workspace_id_idx";

ALTER TABLE "webhook_endpoints" ADD COLUMN "project_id" UUID,
ADD COLUMN "secret_sealed" JSONB,
ADD COLUMN "events_list" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "webhook_endpoints"
SET "events_list" = ARRAY(SELECT jsonb_array_elements_text("events"))
WHERE jsonb_typeof("events") = 'array';

ALTER TABLE "webhook_endpoints" DROP COLUMN "events",
DROP COLUMN "secret",
DROP COLUMN "description";
ALTER TABLE "webhook_endpoints" RENAME COLUMN "events_list" TO "events";

-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "endpoint_id" UUID;

-- CreateTable
CREATE TABLE "project_notes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'context',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_endpoints_project_id_idx" ON "webhook_endpoints"("project_id");

-- CreateIndex
CREATE INDEX "project_notes_project_id_idx" ON "project_notes"("project_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_idx" ON "webhook_deliveries"("endpoint_id");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
