import { z } from "zod";
import { artifactFileUrl } from "@/lib/storage/artifact-url";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId]/artifacts
// ============================================================

const Query = z.object({ type: z.enum(["screenshot", "video", "dom_snapshot", "network_log"]).optional() });

export const GET = route({ query: Query }, async ({ query: { type }, params: { projectId, runId }, db }) => {
  const project = await db.project(projectId);

  const artifacts = await project.runArtifact.findMany({
    where: { testRunId: runId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      storageKey: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      stepIndex: true,
      testResultId: true,
      createdAt: true,
    },
  });

  return artifacts.map((a) => ({
    ...a,
    url: artifactFileUrl(projectId, runId, a.id),
  }));
});
