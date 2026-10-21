import { apiSuccess, apiError } from "@/lib/utils/api";
import { readPlanJobState } from "@/services/planning/plan-jobs";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Latest plan generation for the project, or null if none in the last day. */
export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  const project = await db.project(projectId);

  return apiSuccess({ job: await readPlanJobState(projectId) });
});
