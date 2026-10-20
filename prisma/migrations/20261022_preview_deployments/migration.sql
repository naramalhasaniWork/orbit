-- Preview deployments: test a PR's preview (Railway, Cloudflare Pages) and report on the PR.

-- AlterTable
ALTER TABLE "environments" ADD COLUMN     "access_mode" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "archived_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "preview_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'default',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "webhook_token_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_bindings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "target_ref" TEXT NOT NULL,
    "target_label" TEXT,
    "allowed_host_suffixes" TEXT[],
    "access_secret_prefix" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_deployments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "binding_id" UUID NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "external_id" TEXT,
    "branch" TEXT,
    "pr_number" INTEGER,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "environment_id" UUID,
    "run_id" UUID,
    "check_run_id" TEXT,
    "ready_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preview_connections_workspace_id_provider_label_key" ON "preview_connections"("workspace_id", "provider", "label");

-- CreateIndex
CREATE UNIQUE INDEX "preview_bindings_project_id_key" ON "preview_bindings"("project_id");

-- CreateIndex
CREATE INDEX "preview_bindings_connection_id_idx" ON "preview_bindings"("connection_id");

-- CreateIndex
CREATE INDEX "preview_deployments_project_id_commit_sha_idx" ON "preview_deployments"("project_id", "commit_sha");

-- CreateIndex
CREATE INDEX "preview_deployments_status_created_at_idx" ON "preview_deployments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "preview_deployments_binding_id_commit_sha_key" ON "preview_deployments"("binding_id", "commit_sha");

-- AddForeignKey
ALTER TABLE "preview_connections" ADD CONSTRAINT "preview_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_bindings" ADD CONSTRAINT "preview_bindings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_bindings" ADD CONSTRAINT "preview_bindings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "preview_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_deployments" ADD CONSTRAINT "preview_deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_deployments" ADD CONSTRAINT "preview_deployments_binding_id_fkey" FOREIGN KEY ("binding_id") REFERENCES "preview_bindings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_deployments" ADD CONSTRAINT "preview_deployments_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: each workspace's enabled Railway IntegrationConfig becomes a PreviewConnection
-- carrying the same vault-encrypted token. No webhook token is set (webhooks stay rejected
-- until one is generated in Settings), and no binding is created: the old config never
-- recorded which Orbit project a Railway project belongs to.
INSERT INTO "preview_connections" ("id", "workspace_id", "provider", "label", "credentials", "config", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), ic."workspace_id", 'railway', 'default',
       jsonb_build_object('encryptedToken', ic."credentials"->>'encryptedToken', 'iv', ic."credentials"->>'iv'),
       '{}'::jsonb, 'active', NOW(), NOW()
FROM "integration_configs" ic
WHERE ic."provider" = 'railway'
  AND ic."is_enabled" = true
  AND ic."credentials" ? 'encryptedToken'
  AND ic."credentials" ? 'iv'
ON CONFLICT ("workspace_id", "provider", "label") DO NOTHING;

-- PreviewConnection is now the only home for the Railway token. Nothing reads Railway
-- IntegrationConfig rows any more, so remove them (enabled or not): a leftover copy of the
-- token would survive a disconnect.
DELETE FROM "integration_configs" WHERE "provider" = 'railway';
