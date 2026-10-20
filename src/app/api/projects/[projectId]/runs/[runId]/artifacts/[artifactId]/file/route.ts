import { getStorage } from "@/lib/storage";
import { apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId]/artifacts/[artifactId]/file
// Streams the raw artifact bytes (screenshots, videos, DOM snapshots)
// from the configured storage provider. This is the browser-facing URL
// for artifacts — storage keys and file:// paths are never exposed.
// ============================================================

export const GET = route({}, async ({ params: { projectId, runId, artifactId }, db }) => {
  const project = await db.project(projectId);

  const artifact = await project.db.runArtifact.findUnique({
    where: { id: artifactId, testRunId: runId },
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

  // DOM snapshots contain HTML captured from arbitrary tested apps —
  // rendering them inline on this origin would be stored XSS. Only
  // passive media renders inline; everything else downloads.
  const SAFE_INLINE = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/webm",
    "video/mp4",
    "application/json",
  ]);
  const contentType = artifact.contentType ?? "application/octet-stream";
  const inline = SAFE_INLINE.has(contentType);
  const safeName = (artifact.fileName ?? "artifact").replace(
    /[^A-Za-z0-9._-]/g,
    "_"
  );

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? contentType : "application/octet-stream",
      "Content-Length": String(data.length),
      // Artifacts are immutable once written — cache aggressively
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    },
  });
});
