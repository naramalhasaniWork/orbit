import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  getProjectBaselines,
  compareWithBaseline,
} from "@/services/execution/baseline-snapshots";

// ============================================================
// GET /api/projects/[projectId]/baselines
// ============================================================

export async function GET(
  request: NextRequest,
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

    const type = request.nextUrl.searchParams.get("type") ?? undefined;
    const runId = request.nextUrl.searchParams.get("runId");

    if (runId) {
      const comparisons = await compareWithBaseline(projectId, runId);
      return apiSuccess({ comparisons });
    }

    const baselines = await getProjectBaselines(projectId, { type });
    return apiSuccess({ baselines });
  } catch (error) {
    return handleApiError(error);
  }
}
