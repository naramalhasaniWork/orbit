import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { readPlanJobState } from "@/services/planning/plan-jobs";

export const dynamic = "force-dynamic";

/** Latest plan generation for the project, or null if none in the last day. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });
    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    return apiSuccess({ job: await readPlanJobState(projectId) });
  } catch (error) {
    return handleApiError(error);
  }
}
