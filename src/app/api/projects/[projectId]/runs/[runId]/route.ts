import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId] — Get run details
// ============================================================

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

    const run = await prisma.testRun.findFirst({
      where: { id: runId, projectId },
      include: {
        results: {
          include: {
            testCase: {
              select: {
                id: true,
                name: true,
                type: true,
                journey: true,
                priorityScore: true,
                isCritical: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        environment: {
          select: {
            id: true,
            name: true,
            type: true,
            url: true,
          },
        },
        triggeredBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!run) {
      return apiError("Test run not found", "NOT_FOUND", 404);
    }

    return apiSuccess(run);
  } catch (error) {
    return handleApiError(error);
  }
}
