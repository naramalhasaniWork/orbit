import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { requireWorkspace, apiError, handleApiError } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId]/artifacts/[artifactId]/file
// Streams the raw artifact bytes (screenshots, videos, DOM snapshots)
// from the configured storage provider. This is the browser-facing URL
// for artifacts — storage keys and file:// paths are never exposed.
// ============================================================

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; runId: string; artifactId: string }>;
  }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId, runId, artifactId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const artifact = await prisma.runArtifact.findFirst({
      where: { id: artifactId, testRunId: runId, projectId },
      select: { storageKey: true, contentType: true, fileName: true },
    });

    if (!artifact) {
      return apiError("Artifact not found", "NOT_FOUND", 404);
    }

    let data: Buffer;
    try {
      data = await getStorage().download(artifact.storageKey);
    } catch {
      return apiError("Artifact file missing from storage", "GONE", 410);
    }

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": artifact.contentType ?? "application/octet-stream",
        "Content-Length": String(data.length),
        // Artifacts are immutable once written — cache aggressively
        "Cache-Control": "private, max-age=86400, immutable",
        ...(artifact.fileName
          ? { "Content-Disposition": `inline; filename="${artifact.fileName}"` }
          : {}),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
