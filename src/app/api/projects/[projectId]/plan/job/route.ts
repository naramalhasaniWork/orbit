import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { readPlanJobState } from "@/services/planning/plan-jobs";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Latest plan generation for the project, or null if none in the last day. */
export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  return apiSuccess({ job: await readPlanJobState(projectId) });
});
