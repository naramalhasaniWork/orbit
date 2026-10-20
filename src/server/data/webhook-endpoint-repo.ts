import { openSecret, sealSecret } from "@/lib/integrations/secret-field";
import { LegacyWebhookSchema, PROJECT_SETTINGS_VERSION, parseLegacyList } from "@/server/domain/config";
import { defaultDb, type Db } from "./db";
import { recordLegacyRead } from "./legacy-reads";
import { migrateProjectLegacy } from "./legacy-migration";
import { readProjectSettings } from "./settings-repo";

/** An endpoint as the settings UI lists it; the secret is never included. */
export interface WebhookEndpointView {
  id: string;
  url: string;
  events: string[];
  isEnabled: boolean;
}

/** An endpoint ready to deliver to. `id` is null for a pre-W3 entry read from settings. */
export interface DeliverableEndpoint {
  id: string | null;
  url: string;
  events: string[];
  isEnabled: boolean;
  secret: string | null;
}

const VIEW = { id: true, url: true, events: true, isEnabled: true } as const;

/**
 * The project's endpoints for the settings UI. Copies any legacy settings.webhooks
 * into the table first, so every listed endpoint has a stable id.
 */
export async function listProjectEndpoints(projectId: string, db: Db = defaultDb): Promise<WebhookEndpointView[]> {
  await migrateProjectLegacy(projectId, db);
  return db.webhookEndpoint.findMany({ where: { projectId }, select: VIEW, orderBy: { createdAt: "asc" } });
}

export async function createProjectEndpoint(
  input: { workspaceId: string; projectId: string; url: string; events: string[]; secret: string },
  db: Db = defaultDb
): Promise<WebhookEndpointView> {
  await migrateProjectLegacy(input.projectId, db);
  return db.webhookEndpoint.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      url: input.url,
      events: input.events,
      isEnabled: true,
      secretSealed: { ...sealSecret(input.secret) },
    },
    select: VIEW,
  });
}

/** Row-level update: concurrent edits to different endpoints never overwrite each other. False when not found. */
export async function updateProjectEndpoint(
  projectId: string,
  endpointId: string,
  patch: { isEnabled?: boolean; events?: string[] },
  db: Db = defaultDb
): Promise<boolean> {
  await migrateProjectLegacy(projectId, db);
  const { count } = await db.webhookEndpoint.updateMany({ where: { id: endpointId, projectId }, data: patch });
  return count > 0;
}

export async function deleteProjectEndpoint(projectId: string, endpointId: string, db: Db = defaultDb): Promise<boolean> {
  await migrateProjectLegacy(projectId, db);
  const { count } = await db.webhookEndpoint.deleteMany({ where: { id: endpointId, projectId } });
  return count > 0;
}

/**
 * Every endpoint a project's events may go to, with secrets opened. Falls back to
 * settings.webhooks (counted) until the project is migrated.
 */
export async function deliverableEndpoints(projectId: string, db: Db = defaultDb): Promise<DeliverableEndpoint[]> {
  const project = await readProjectSettings(projectId, db);
  if (!project) return [];

  if (project.settings.schemaVersion < PROJECT_SETTINGS_VERSION) {
    const legacy = parseLegacyList(LegacyWebhookSchema, project.settings.webhooks);
    if (legacy.length) recordLegacyRead("project.webhooks", { workspaceId: project.workspaceId, projectId });
    return legacy.map((hook) => ({
      id: null,
      url: hook.url,
      events: hook.events,
      isEnabled: hook.enabled !== false,
      secret: openSecret(hook.secretSealed ?? hook.secret),
    }));
  }

  const rows = await db.webhookEndpoint.findMany({
    where: { projectId },
    select: { ...VIEW, secretSealed: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(({ secretSealed, ...row }) => ({ ...row, secret: openSecret(secretSealed) }));
}
