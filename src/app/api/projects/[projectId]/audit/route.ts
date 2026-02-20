import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { runCodeAudit } from "@/services/auditing/auditor";

// ============================================================
// GET /api/projects/[projectId]/audit — List past audits
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

    const limit = Number(request.nextUrl.searchParams.get("limit")) || 20;

    const audits = await prisma.auditResult.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
      select: {
        id: true,
        overallScore: true,
        issueCount: true,
        criticalCount: true,
        categories: true,
        metadata: true,
        createdAt: true,
      },
    });

    return apiSuccess(audits);
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// POST /api/projects/[projectId]/audit — Trigger a new audit
// ============================================================

interface TriggerAuditBody {
  focusAreas?: string[];
  filePaths?: string[];
  maxFiles?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    await requirePermission(workspaceId, "runs.create");

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as TriggerAuditBody;

    const result = await runCodeAudit({
      projectId,
      focusAreas: body.focusAreas,
      filePaths: body.filePaths,
      maxFiles: body.maxFiles,
    });

    return apiSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
