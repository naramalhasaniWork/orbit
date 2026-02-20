import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { getTraceTree } from "@/services/tracing";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, runId } = await params;

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
  } catch (error) {
    return handleApiError(error);
  }
}
