import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { getTraceTree } from "@/services/tracing";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId, runId }, workspaceId }) => {
  // Verify project belongs to workspace
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  // Verify run belongs to project
  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId },
    select: { id: true },
  });

  if (!run) {
    return apiError("Run not found", "NOT_FOUND", 404);
  }

  const traceTree = await getTraceTree(runId);

  return apiSuccess(traceTree);
});
