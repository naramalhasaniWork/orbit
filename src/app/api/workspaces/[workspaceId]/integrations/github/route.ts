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
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId: authedWorkspaceId } = await requireWorkspace();
    const { workspaceId } = await params;

    if (authedWorkspaceId !== workspaceId) {
      return apiError("Forbidden", "FORBIDDEN", 403);
    }

    await prisma.gitHubInstallation.deleteMany({
      where: { workspaceId },
    });

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });
    const currentSettings = (workspace?.settings as Record<string, unknown>) ?? {};

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        settings: {
          ...currentSettings,
          github: { connected: false },
        },
      },
    });

    return apiSuccess({ disconnected: true });
  } catch (error) {
    return handleApiError(error);
  }
}
