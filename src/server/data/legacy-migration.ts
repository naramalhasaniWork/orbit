import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { sealSecret } from "@/server/data/sealing";
import {
  LegacyNoteSchema,
  LegacyWebhookSchema,
  PROJECT_SETTINGS_VERSION,
  SealedSecretSchema,
  parseIntegrationSettings,
  parseLegacyList,
  type TypedProvider,
} from "@/server/domain/config";
import { defaultDb, withTransaction, type Db } from "./db";
import { isTypedRow, legacyProjectOverride, legacyWorkspaceIntegration, type LegacyIntegration } from "./integration-legacy";
import { patchSettingsJson } from "./json-patch";
import { parseProjectSettings, readWorkspaceSettings } from "./settings-repo";

/**
 * Copies pre-W3 settings JSON into the typed tables. Shared by the 20261025 backfill
 * and by writers that touch a not-yet-migrated row. Every step is idempotent: inserts
 * skip existing rows (ON CONFLICT DO NOTHING) and the old keys are left in place.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The legacy id when it is a uuid, else one derived from stable inputs, so reruns hit the same row. */
export function stableId(legacyId: string | undefined, ...parts: string[]): string {
  if (legacyId && UUID.test(legacyId)) return legacyId.toLowerCase();
  const hex = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Keep a sealed value as is; seal legacy plaintext. */
function toSealed(secret: unknown): Prisma.InputJsonValue | null {
  const sealed = SealedSecretSchema.safeParse(secret);
  if (sealed.success) return sealed.data;
  return typeof secret === "string" && secret ? { ...sealSecret(secret) } : null;
}

/**
 * Insert the connection, or fill a pre-W3 row that has no credentials yet. A row
 * written by the new code (credentials set, or disconnected) is never touched.
 */
async function upsertLegacyIntegration<P extends TypedProvider>(
  workspaceId: string,
  provider: P,
  legacy: LegacyIntegration<P>,
  db: Db
): Promise<boolean> {
  const credentialsSealed = toSealed(legacy.secret);
  if (!credentialsSealed) return false;
  const data = {
    status: "connected" as const,
    isEnabled: true,
    credentialsSealed,
    externalAccountId: legacy.externalAccountId,
    displayName: legacy.displayName,
    settings: legacy.settings as Prisma.InputJsonValue,
  };
  const inserted = await db.integrationConfig.createMany({
    data: [{ workspaceId, provider, ...data }],
    skipDuplicates: true,
  });
  const filled = await db.integrationConfig.updateMany({
    where: { workspaceId, provider, credentialsSealed: { equals: Prisma.DbNull }, status: { not: "disconnected" } },
    data,
  });
  return inserted.count + filled.count > 0;
}

/** Copy one provider's workspace.settings connection into IntegrationConfig. */
export async function migrateWorkspaceIntegration(
  workspaceId: string,
  provider: TypedProvider,
  db: Db = defaultDb
): Promise<boolean> {
  const settings = await readWorkspaceSettings(workspaceId, db);
  const legacy = settings ? legacyWorkspaceIntegration(settings, provider) : null;
  return legacy ? upsertLegacyIntegration(workspaceId, provider, legacy, db) : false;
}

/**
 * A project-level Linear/Slack override becomes the workspace's connection only when
 * the workspace has none. Returns "conflict" when the workspace already has one: the
 * override then stays readable through the dual-read fallback until the keys are stripped.
 * Projects already migrated (schemaVersion 2) were handled by an earlier run: "none".
 */
export async function promoteProjectIntegration(
  projectId: string,
  provider: TypedProvider,
  db: Db = defaultDb
): Promise<"none" | "promoted" | "conflict"> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { workspaceId: true, settings: true } });
  const settings = project ? parseProjectSettings(project.settings) : null;
  if (!project || !settings || settings.schemaVersion >= PROJECT_SETTINGS_VERSION) return "none";
  const override = legacyProjectOverride(settings, provider);
  if (!override?.secret) return "none";

  const existing = await db.integrationConfig.findUnique({
    where: { integration_config_unique: { workspaceId: project.workspaceId, provider } },
    select: { status: true, credentialsSealed: true },
  });
  if (existing && isTypedRow(existing)) return "conflict";

  const promoted = await upsertLegacyIntegration(
    project.workspaceId,
    provider,
    {
      secret: override.secret,
      externalAccountId: override.externalAccountId,
      displayName: null,
      settings: parseIntegrationSettings(provider, {}),
    },
    db
  );
  return promoted ? "promoted" : "none";
}

export interface ProjectMigration {
  migrated: boolean;
  notes: number;
  webhooks: number;
}

/**
 * Move project.settings.testingNotes and .webhooks into ProjectNote / WebhookEndpoint
 * and mark the settings schemaVersion 2, under a row lock so concurrent callers
 * serialize. A project already at version 2 is a no-op.
 */
export async function migrateProjectLegacy(projectId: string, db: Db = defaultDb): Promise<ProjectMigration> {
  const none = { migrated: false, notes: 0, webhooks: 0 };
  const current = await db.project.findUnique({ where: { id: projectId }, select: { settings: true } });
  if (!current || parseProjectSettings(current.settings).schemaVersion >= PROJECT_SETTINGS_VERSION) return none;

  return withTransaction(db, async (tx) => {
    const [row] = await tx.$queryRaw<{ workspaceId: string; settings: unknown }[]>`
      SELECT "workspace_id" AS "workspaceId", "settings" FROM "projects" WHERE "id" = ${projectId}::uuid FOR UPDATE`;
    if (!row) return none;
    const settings = parseProjectSettings(row.settings);
    if (settings.schemaVersion >= PROJECT_SETTINGS_VERSION) return none;

    const notes = parseLegacyList(LegacyNoteSchema, settings.testingNotes).map((note, i) => {
      const createdAt = toDate(note.createdAt);
      return {
        id: stableId(note.id, projectId, "note", String(i), note.content),
        projectId,
        content: note.content,
        category: note.category,
        active: note.active,
        createdAt,
        updatedAt: toDate(note.updatedAt) ?? createdAt,
      };
    });
    const webhooks = parseLegacyList(LegacyWebhookSchema, settings.webhooks).map((hook, i) => ({
      id: stableId(hook.id, projectId, "webhook", String(i), hook.url),
      workspaceId: row.workspaceId,
      projectId,
      url: hook.url,
      events: hook.events,
      isEnabled: hook.enabled !== false,
      secretSealed: toSealed(hook.secretSealed ?? hook.secret) ?? Prisma.DbNull,
    }));

    const insertedNotes = notes.length ? await tx.projectNote.createMany({ data: notes, skipDuplicates: true }) : { count: 0 };
    const insertedHooks = webhooks.length
      ? await tx.webhookEndpoint.createMany({ data: webhooks, skipDuplicates: true })
      : { count: 0 };
    await patchSettingsJson("project", projectId, { schemaVersion: PROJECT_SETTINGS_VERSION }, [], tx);
    return { migrated: true, notes: insertedNotes.count, webhooks: insertedHooks.count };
  });
}

function toDate(value: string | undefined): Date | undefined {
  const date = value ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}
