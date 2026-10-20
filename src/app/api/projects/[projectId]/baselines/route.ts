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
import {
  acceptAsBaseline,
  listBaselines,
} from "@/services/visual-qa/baseline-manager";
import { requirePermission } from "@/lib/auth/rbac";

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
    const source = request.nextUrl.searchParams.get("source");

    // Visual QA baselines — deduplicated per route
    if (source === "visual-qa") {
      const baselines = await listBaselines(projectId);
      return apiSuccess({ baselines });
    }

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

// ============================================================
// POST /api/projects/[projectId]/baselines — Accept as baseline
// ============================================================

interface AcceptBaselineBody {
  routePath: string;
  storageKey: string;
  checksum: string;
  runId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "plans.update");
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as AcceptBaselineBody;

    if (!body.routePath || !body.storageKey || !body.checksum || !body.runId) {
      return apiError(
        "routePath, storageKey, checksum, and runId are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const baseline = await acceptAsBaseline(
      projectId,
      body.runId,
      body.routePath,
      body.storageKey,
      body.checksum
    );

    return apiSuccess({ baseline }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
