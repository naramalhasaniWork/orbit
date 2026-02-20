import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// GET /api/projects/[projectId]/audit/[auditId] — Single audit
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; auditId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, auditId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const audit = await prisma.auditResult.findFirst({
      where: { id: auditId, projectId },
    });

    if (!audit) {
      return apiError("Audit result not found", "NOT_FOUND", 404);
    }

    return apiSuccess(audit);
  } catch (error) {
    return handleApiError(error);
  }
}
