/**
 * GET/POST/PATCH/DELETE /api/projects/:projectId/notes — testing notes injected into
 * planner/executor prompts. Each note is a ProjectNote row (project-note-repo).
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/utils/api";
import { NOTE_CATEGORIES } from "@/server/domain/config";
import {
  createProjectNote,
  deleteProjectNote,
  listProjectNotes,
  updateProjectNote,
} from "@/server/data/project-note-repo";
import { route } from "@/server/http/route";

const createSchema = z.object({
  content: z.string().trim().min(1, "Note content is required"),
  category: z.enum(NOTE_CATEGORIES).default("context"),
});

const patchSchema = z.object({
  noteId: z.string().uuid("noteId is required"),
  content: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  category: z.enum(NOTE_CATEGORIES).optional(),
});

const deleteQuery = z.object({ noteId: z.string().uuid("noteId query param is required") });

function findProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
}

export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  if (!(await findProject(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);
  return listProjectNotes(projectId);
});

export const POST = route(
  { permission: "projects.update", body: createSchema },
  async ({ body, params: { projectId }, workspaceId }) => {
    if (!(await findProject(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);
    return apiSuccess(await createProjectNote(projectId, body), 201);
  }
);

export const PATCH = route(
  { permission: "projects.update", body: patchSchema },
  async ({ body: { noteId, ...patch }, params: { projectId }, workspaceId }) => {
    if (!(await findProject(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);
    const note = await updateProjectNote(projectId, noteId, patch);
    return note ?? apiError("Note not found", "NOT_FOUND", 404);
  }
);

export const DELETE = route(
  { permission: "projects.update", query: deleteQuery },
  async ({ query: { noteId }, params: { projectId }, workspaceId }) => {
    if (!(await findProject(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);
    if (!(await deleteProjectNote(projectId, noteId))) return apiError("Note not found", "NOT_FOUND", 404);
    return { deleted: true };
  }
);
