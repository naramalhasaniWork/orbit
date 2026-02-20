import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { analyzeDiff } from "@/services/planning/diff-analyzer";

// ============================================================
// POST /api/projects/[projectId]/diff-analysis — Analyze PR diff
// ============================================================

interface DiffAnalysisBody {
  changedFiles: Array<{
    path: string;
    status?: "added" | "modified" | "deleted" | "renamed";
    additions?: number;
    deletions?: number;
  }>;
}

export async function POST(
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

    const body = (await request.json()) as DiffAnalysisBody;

    if (!Array.isArray(body.changedFiles)) {
      return apiError(
        "changedFiles must be an array",
        "VALIDATION_ERROR",
        400
      );
    }

    if (body.changedFiles.length > 500) {
      return apiError(
        "Too many changed files (max 500)",
        "VALIDATION_ERROR",
        400
      );
    }

    const diffFiles = body.changedFiles.map((f) => ({
      path: String(f.path),
      status: f.status ?? ("modified" as const),
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
    }));

    const analysis = await analyzeDiff(projectId, diffFiles);

    return apiSuccess(analysis);
  } catch (error) {
    return handleApiError(error);
  }
}
