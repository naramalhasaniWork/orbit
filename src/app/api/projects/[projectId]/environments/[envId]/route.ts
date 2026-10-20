import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; envId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, envId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const environment = await prisma.environment.findFirst({
      where: { id: envId, projectId },
    });

    if (!environment) {
      return apiError("Environment not found", "NOT_FOUND", 404);
    }

    return apiSuccess(environment);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; envId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "projects.update");
    const { projectId, envId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const environment = await prisma.environment.findFirst({
      where: { id: envId, projectId },
      select: { id: true },
    });

    if (!environment) {
      return apiError("Environment not found", "NOT_FOUND", 404);
    }

    await prisma.environment.delete({ where: { id: envId } });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
