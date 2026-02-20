import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId: sessionWorkspaceId } = await requireWorkspace();
    const { workspaceId } = await params;

    if (workspaceId !== sessionWorkspaceId) {
      return apiError("Forbidden", "FORBIDDEN", 403);
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    return apiSuccess(workspace.settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId: sessionWorkspaceId, session } = await requireWorkspace();
    const { workspaceId } = await params;

    if (workspaceId !== sessionWorkspaceId) {
      return apiError("Forbidden", "FORBIDDEN", 403);
    }

    // Only admins can update workspace settings
    if (session.role !== "admin") {
      return apiError("Only workspace admins can update settings", "FORBIDDEN", 403);
    }

    const body = await request.json();
    const { customPrompt } = body as { customPrompt?: string };

    if (customPrompt !== undefined && typeof customPrompt !== "string") {
      return apiError("customPrompt must be a string", "VALIDATION_ERROR", 400);
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    const currentSettings = (workspace.settings ?? {}) as Record<string, unknown>;
    const updatedSettings = {
      ...currentSettings,
      ...(customPrompt !== undefined ? { customPrompt } : {}),
    };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { settings: updatedSettings },
    });

    return apiSuccess(updatedSettings);
  } catch (error) {
    return handleApiError(error);
  }
}
