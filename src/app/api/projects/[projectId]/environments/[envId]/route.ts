import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId, envId }, workspaceId }) => {
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
});

/** Deleting an environment cascades to its secrets, so it needs secrets.manage. */
export const DELETE = route(
  { permission: "secrets.manage" },
  async ({ params: { projectId, envId }, workspaceId }) => {
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
  }
);
