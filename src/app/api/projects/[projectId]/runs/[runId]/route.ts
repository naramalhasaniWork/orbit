import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { cancelRun } from "@/services/orchestrator/run-manager";

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

// ============================================================
// PATCH /api/projects/[projectId]/runs/[runId] — Update run (cancel)
// ============================================================

const PatchRunSchema = z.object({
  status: z.enum(["cancelled"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, runId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = PatchRunSchema.parse(await request.json());

    if (body.status === "cancelled") {
      const cancelled = await cancelRun(runId);
      if (!cancelled) {
        return apiError("Run cannot be cancelled (already completed or not found)", "INVALID_STATE", 409);
      }
      return apiSuccess({ id: runId, status: "cancelled" });
    }

    return apiError("Invalid status", "INVALID_INPUT", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
