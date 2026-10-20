import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const DELETE = route(
  { permission: "secrets.manage" },
  async ({ params: { projectId, secretId }, db }) => {
    const project = await db.project(projectId);

    const secret = await project.db.secret.findUnique({
      where: { id: secretId },
      select: { id: true },
    });

    if (!secret) {
      return apiError("Secret not found", "NOT_FOUND", 404);
    }

    await project.db.secret.delete({ where: { id: secretId } });

    return apiSuccess({ deleted: true });
  }
);
