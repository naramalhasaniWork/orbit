import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";
import { FRAME_KEY_PATTERN, frameRedisKey } from "@/server/realtime/frames";

export const dynamic = "force-dynamic";

// ============================================================
// GET /api/projects/[projectId]/runs/[runId]/frames/[frameKey]
// The JPEG behind a screenshot:frame event. Frames live in Redis for a
// short while; the run must belong to a project in the caller's workspace,
// so another workspace gets the same 404 as a missing or expired frame.
// ============================================================

export const GET = route(
  {
    params: z.object({
      projectId: z.string(),
      runId: z.string(),
      frameKey: z.string().regex(FRAME_KEY_PATTERN),
    }),
  },
  async ({ params: { projectId, runId, frameKey }, db }) => {
    const project = await db.findProject(projectId);
    const run = project && (await project.testRun.findUnique({ where: { id: runId }, select: { id: true } }));
    if (!run) return apiError("Frame not found", "NOT_FOUND", 404);

    const jpeg = await getRedis().getBuffer(frameRedisKey(runId, frameKey));
    if (!jpeg) return apiError("Frame not found", "NOT_FOUND", 404);

    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "private, max-age=1800, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  }
);
