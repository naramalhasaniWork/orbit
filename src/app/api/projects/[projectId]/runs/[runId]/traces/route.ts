import { apiSuccess, apiError } from "@/lib/utils/api";
import { getTraceTree } from "@/services/tracing";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId, runId }, db }) => {
  const project = await db.project(projectId);

  const run = await project.testRun.findUnique({
    where: { id: runId },
    select: { id: true },
  });

  if (!run) {
    return apiError("Run not found", "NOT_FOUND", 404);
  }

  const traceTree = await getTraceTree(runId);

  return apiSuccess(traceTree);
});
