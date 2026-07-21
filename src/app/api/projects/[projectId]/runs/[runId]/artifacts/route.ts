import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { artifactFileUrl } from "@/lib/storage/artifact-url";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId]/artifacts
// ============================================================

export async function GET(
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

    const typeFilter = request.nextUrl.searchParams.get("type");

    const artifacts = await prisma.runArtifact.findMany({
      where: {
        testRunId: runId,
        projectId,
        ...(typeFilter ? { type: typeFilter as "screenshot" | "video" | "dom_snapshot" | "network_log" } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        storageKey: true,
        fileName: true,
        contentType: true,
        sizeBytes: true,
        stepIndex: true,
        createdAt: true,
      },
    });

    const withUrls = artifacts.map((a) => ({
      ...a,
      url: artifactFileUrl(projectId, runId, a.id),
    }));

    return apiSuccess(withUrls);
  } catch (error) {
    return handleApiError(error);
  }
}
