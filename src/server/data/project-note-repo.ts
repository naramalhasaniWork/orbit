import {
  LegacyNoteSchema,
  PROJECT_SETTINGS_VERSION,
  parseLegacyList,
  type NoteCategory,
} from "@/server/domain/config";
import { defaultDb, type Db } from "./db";
import { recordLegacyRead } from "./legacy-reads";
import { migrateProjectLegacy } from "./legacy-migration";
import { readProjectSettings } from "./settings-repo";

export interface ProjectNoteView {
  id: string;
  content: string;
  category: NoteCategory;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VIEW = { id: true, content: true, category: true, active: true, createdAt: true, updatedAt: true } as const;

function toView(row: Omit<ProjectNoteView, "category"> & { category: string }): ProjectNoteView {
  return { ...row, category: LegacyNoteSchema.shape.category.parse(row.category) };
}

/** All notes for the settings UI (legacy settings.testingNotes are copied in first). */
export async function listProjectNotes(projectId: string, db: Db = defaultDb): Promise<ProjectNoteView[]> {
  await migrateProjectLegacy(projectId, db);
  const rows = await db.projectNote.findMany({ where: { projectId }, select: VIEW, orderBy: { createdAt: "asc" } });
  return rows.map(toView);
}

export async function createProjectNote(
  projectId: string,
  input: { content: string; category: NoteCategory },
  db: Db = defaultDb
): Promise<ProjectNoteView> {
  await migrateProjectLegacy(projectId, db);
  return toView(await db.projectNote.create({ data: { projectId, ...input, active: true }, select: VIEW }));
}

/** Row-level update; null when the note is not in this project. */
export async function updateProjectNote(
  projectId: string,
  noteId: string,
  patch: { content?: string; category?: NoteCategory; active?: boolean },
  db: Db = defaultDb
): Promise<ProjectNoteView | null> {
  await migrateProjectLegacy(projectId, db);
  const { count } = await db.projectNote.updateMany({ where: { id: noteId, projectId }, data: patch });
  if (count === 0) return null;
  const row = await db.projectNote.findFirst({ where: { id: noteId, projectId }, select: VIEW });
  return row ? toView(row) : null;
}

export async function deleteProjectNote(projectId: string, noteId: string, db: Db = defaultDb): Promise<boolean> {
  await migrateProjectLegacy(projectId, db);
  const { count } = await db.projectNote.deleteMany({ where: { id: noteId, projectId } });
  return count > 0;
}

/** Active notes for prompts. Falls back to settings.testingNotes (counted) until the project is migrated. */
export async function activeProjectNotes(
  projectId: string,
  db: Db = defaultDb
): Promise<Pick<ProjectNoteView, "id" | "content" | "category" | "active">[]> {
  const project = await readProjectSettings(projectId, db);
  if (!project) return [];

  if (project.settings.schemaVersion < PROJECT_SETTINGS_VERSION) {
    const legacy = parseLegacyList(LegacyNoteSchema, project.settings.testingNotes);
    if (legacy.length) recordLegacyRead("project.testingNotes", { workspaceId: project.workspaceId, projectId });
    return legacy
      .filter((n) => n.active)
      .map((n, i) => ({ id: n.id ?? String(i), content: n.content, category: n.category, active: true }));
  }

  const rows = await db.projectNote.findMany({
    where: { projectId, active: true },
    select: { id: true, content: true, category: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({ ...row, category: LegacyNoteSchema.shape.category.parse(row.category) }));
}
