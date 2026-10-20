import {
  ProjectSettingsSchema,
  WorkspaceSettingsSchema,
  type ProjectSettings,
  type WorkspaceSettings,
} from "@/server/domain/config";
import { logger } from "@/server/observability/logger";
import { defaultDb, type Db } from "./db";
import { patchSettingsJson, type SettingsPatch } from "./json-patch";

export function parseProjectSettings(raw: unknown): ProjectSettings {
  const parsed = ProjectSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  logger.warn({ issues: parsed.error.issues.length }, "project.settings is not an object; using defaults");
  return ProjectSettingsSchema.parse({});
}

export function parseWorkspaceSettings(raw: unknown): WorkspaceSettings {
  const parsed = WorkspaceSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  logger.warn({ issues: parsed.error.issues.length }, "workspace.settings is not an object; using defaults");
  return WorkspaceSettingsSchema.parse({});
}

/** The project's parsed settings plus its workspace, or null when it does not exist. */
export async function readProjectSettings(
  projectId: string,
  db: Db = defaultDb
): Promise<{ workspaceId: string; settings: ProjectSettings } | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true, settings: true },
  });
  return project ? { workspaceId: project.workspaceId, settings: parseProjectSettings(project.settings) } : null;
}

export async function readWorkspaceSettings(workspaceId: string, db: Db = defaultDb): Promise<WorkspaceSettings | null> {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } });
  return workspace ? parseWorkspaceSettings(workspace.settings) : null;
}

/** Atomic merge into project.settings (see patchSettingsJson). False when the project is missing. */
export function patchProjectSettings(projectId: string, patch: SettingsPatch, remove: string[] = [], db: Db = defaultDb) {
  return patchSettingsJson("project", projectId, patch, remove, db);
}

/** Atomic merge into workspace.settings (see patchSettingsJson). False when the workspace is missing. */
export function patchWorkspaceSettings(workspaceId: string, patch: SettingsPatch, remove: string[] = [], db: Db = defaultDb) {
  return patchSettingsJson("workspace", workspaceId, patch, remove, db);
}
