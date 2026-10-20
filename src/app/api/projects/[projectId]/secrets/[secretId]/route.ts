import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const DELETE = route(
  { permission: "secrets.manage" },
  async ({ params: { projectId, secretId }, workspaceId }) => {
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
  }
);
