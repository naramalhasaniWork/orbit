/**
 * W3 backfill: copies pre-W3 settings JSON into the typed tables.
 *   - workspace.settings linearApiKey/linearTeamId/linear and slackWebhookUrl/slack → IntegrationConfig
 *   - project.settings Linear/Slack overrides → the workspace's IntegrationConfig when it has none
 *   - project.settings.webhooks → WebhookEndpoint (same ids; plaintext secrets sealed)
 *   - project.settings.testingNotes → ProjectNote (same ids)
 *
 * Idempotent: inserts skip existing rows (ON CONFLICT DO NOTHING), integration rows are only
 * filled while they hold no credentials, migrated projects are marked settings.schemaVersion 2,
 * and the old keys are left in place for the dual-read fallback. Safe to run on every release.
 *
 *   pnpm backfill:20261025                                    (from a checkout, DATABASE_URL set)
 *   ORBIT_ROLE=migrate ORBIT_RUN_BACKFILLS=true ./start.sh    (in the image; see docs/self-hosting)
 */

import { pathToFileURL } from "node:url";
import { prisma } from "@/lib/db";
import type { TypedProvider } from "@/server/domain/config";
import type { Db } from "@/server/data/db";
import {
  migrateProjectLegacy,
  migrateWorkspaceIntegration,
  promoteProjectIntegration,
} from "@/server/data/legacy-migration";
import { logger } from "@/server/observability/logger";

const PROVIDERS: TypedProvider[] = ["linear", "slack"];

export interface BackfillReport {
  integrations: number;
  promoted: number;
  /** "projectId:provider" overrides left in project.settings because the workspace already has a connection. */
  conflicts: string[];
  projects: number;
  notes: number;
  endpoints: number;
}

export async function runBackfill(db: Db = prisma): Promise<BackfillReport> {
  const report: BackfillReport = { integrations: 0, promoted: 0, conflicts: [], projects: 0, notes: 0, endpoints: 0 };

  // Workspaces first, so a workspace's own connection wins over any project override.
  const workspaces = await db.workspace.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const { id } of workspaces) {
    for (const provider of PROVIDERS) {
      if (await migrateWorkspaceIntegration(id, provider, db)) report.integrations++;
    }
  }

  const projects = await db.project.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const { id } of projects) {
    for (const provider of PROVIDERS) {
      const outcome = await promoteProjectIntegration(id, provider, db);
      if (outcome === "promoted") report.promoted++;
      if (outcome === "conflict") report.conflicts.push(`${id}:${provider}`);
    }
    const moved = await migrateProjectLegacy(id, db);
    if (moved.migrated) report.projects++;
    report.notes += moved.notes;
    report.endpoints += moved.webhooks;
  }

  return report;
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runBackfill()
    .then((report) => {
      logger.info({ backfill: "20261025_integrations", ...report }, "backfill complete");
      if (report.conflicts.length) {
        logger.warn({ conflicts: report.conflicts }, "project overrides kept in project.settings; review before the old keys are stripped");
      }
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, "backfill 20261025_integrations failed");
      process.exitCode = 1;
    })
    // The pg pool would otherwise hold the process open until its idle timeout
    .finally(async () => {
      await prisma.$disconnect();
      process.exit();
    });
}
