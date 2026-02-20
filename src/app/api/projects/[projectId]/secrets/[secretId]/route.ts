import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; secretId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, secretId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const secret = await prisma.secret.findFirst({
      where: { id: secretId, projectId },
      select: { id: true },
    });

    if (!secret) {
      return apiError("Secret not found", "NOT_FOUND", 404);
    }

    await prisma.secret.delete({ where: { id: secretId } });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
