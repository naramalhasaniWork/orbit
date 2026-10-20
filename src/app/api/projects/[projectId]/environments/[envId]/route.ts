import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId, envId }, db }) => {
  const project = await db.project(projectId);

  const environment = await project.environment.findUnique({
    where: { id: envId },
  });

  if (!environment) {
    return apiError("Environment not found", "NOT_FOUND", 404);
  }

  return apiSuccess(environment);
});

/** Deleting an environment cascades to its secrets, so it needs secrets.manage. */
export const DELETE = route(
  { permission: "secrets.manage" },
  async ({ params: { projectId, envId }, db }) => {
    const project = await db.project(projectId);

    const environment = await project.environment.findUnique({
      where: { id: envId },
      select: { id: true },
    });

    if (!environment) {
      return apiError("Environment not found", "NOT_FOUND", 404);
    }

    await project.environment.delete({ where: { id: envId } });

    return apiSuccess({ deleted: true });
  }
);
