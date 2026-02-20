import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  getProjectMappings,
  approveMapping,
  revokeMapping,
} from "@/services/execution/selector-memory";

// ============================================================
// GET /api/projects/[projectId]/selectors
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

    const approvedOnly = request.nextUrl.searchParams.get("approved") === "true";
    const mappings = await getProjectMappings(projectId, { approvedOnly });

    return apiSuccess({ mappings });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// PATCH /api/projects/[projectId]/selectors
// Approve or revoke a selector mapping
// ============================================================

export async function PATCH(
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

    const body = await request.json();
    const { mappingId, action } = body as {
      mappingId: string;
      action: "approve" | "revoke" | "delete";
    };

    if (!mappingId || !action) {
      return apiError("mappingId and action are required", "VALIDATION_ERROR", 400);
    }

    const mapping = await prisma.selectorMapping.findFirst({
      where: { id: mappingId, projectId },
    });

    if (!mapping) {
      return apiError("Mapping not found", "NOT_FOUND", 404);
    }

    if (action === "approve") {
      await approveMapping(mappingId);
    } else if (action === "revoke") {
      await revokeMapping(mappingId);
    } else if (action === "delete") {
      await revokeMapping(mappingId, true);
    }

    return apiSuccess({ mappingId, action });
  } catch (error) {
    return handleApiError(error);
  }
}
