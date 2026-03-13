import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

interface TestingNote {
  id: string;
  content: string;
  category: "context" | "instruction" | "known-issue" | "credential-hint";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { settings: true },
    });

    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const settings = (project.settings as Record<string, unknown>) ?? {};
    const notes = (settings.testingNotes as TestingNote[]) ?? [];

    return apiSuccess(notes);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;
    const body = await req.json();

    const { content, category } = body as { content?: string; category?: string };
    if (!content?.trim()) {
      return apiError("Note content is required", "VALIDATION_ERROR", 400);
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { settings: true },
    });

    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const settings = (project.settings as Record<string, unknown>) ?? {};
    const notes = (settings.testingNotes as TestingNote[]) ?? [];

    const note: TestingNote = {
      id: randomUUID(),
      content: content.trim(),
      category: (category as TestingNote["category"]) ?? "context",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedNotes = [...notes, note];

    await prisma.project.update({
      where: { id: projectId },
      data: {
        settings: JSON.parse(JSON.stringify({ ...settings, testingNotes: updatedNotes })),
      },
    });

    return apiSuccess(note, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;
    const body = await req.json();

    const { noteId, content, active, category } = body as {
      noteId: string;
      content?: string;
      active?: boolean;
      category?: string;
    };

    if (!noteId) return apiError("noteId is required", "VALIDATION_ERROR", 400);

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { settings: true },
    });

    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const settings = (project.settings as Record<string, unknown>) ?? {};
    const notes = (settings.testingNotes as TestingNote[]) ?? [];

    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx < 0) return apiError("Note not found", "NOT_FOUND", 404);

    const updated = { ...notes[idx] };
    if (content !== undefined) updated.content = content.trim();
    if (active !== undefined) updated.active = active;
    if (category !== undefined) updated.category = category as TestingNote["category"];
    updated.updatedAt = new Date().toISOString();
    notes[idx] = updated;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        settings: JSON.parse(JSON.stringify({ ...settings, testingNotes: notes })),
      },
    });

    return apiSuccess(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get("noteId");

    if (!noteId) return apiError("noteId query param is required", "VALIDATION_ERROR", 400);

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { settings: true },
    });

    if (!project) return apiError("Project not found", "NOT_FOUND", 404);

    const settings = (project.settings as Record<string, unknown>) ?? {};
    const notes = (settings.testingNotes as TestingNote[]) ?? [];

    const filtered = notes.filter((n) => n.id !== noteId);
    if (filtered.length === notes.length) {
      return apiError("Note not found", "NOT_FOUND", 404);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        settings: JSON.parse(JSON.stringify({ ...settings, testingNotes: filtered })),
      },
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
