import { NextRequest } from "next/server";
import { getServerSession } from "@/lib/utils/api";
import { forWorkspace } from "@/server/data/scope";
import { getRedis } from "@/lib/redis";
import { channels } from "@/lib/redis/pubsub";
import { createSSEStream } from "@/lib/sse/stream";
import { latestScreenshotKey } from "@/services/execution/screenshot-streamer";
import type { WebSocketEvent } from "@/lib/websocket/channels";

export const dynamic = "force-dynamic";

/**
 * SSE endpoint that streams live screenshots during test execution.
 * Subscribes to the run:${runId}:screenshots Redis pub/sub channel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId, runId } = await params;

  const project = session.workspaceId ? await forWorkspace(session.workspaceId).findProject(projectId) : null;

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  const run = await project.db.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  // If run already completed, return artifacts instead of streaming
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  if (terminalStatuses.has(run.status)) {
    const artifacts = await project.db.runArtifact.findMany({
      where: {
        testRunId: runId,
        type: "screenshot",
        contentType: "image/jpeg",
      },
      orderBy: { createdAt: "asc" },
      select: {
        storageKey: true,
        stepIndex: true,
        fileName: true,
        createdAt: true,
      },
    });

    const encoder = new TextEncoder();
    const body = encoder.encode(
      `event: screenshots:complete\ndata: ${JSON.stringify({
        runId,
        status: run.status,
        artifactCount: artifacts.length,
      })}\n\n`
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  const lastEventId =
    request.headers.get("Last-Event-ID") ??
    request.nextUrl.searchParams.get("lastEventId");
  const channel = channels.runScreenshots(runId);

  // Read the latest buffered screenshot so late-joining clients get it immediately.
  // Redis pub/sub is fire-and-forget, so without this, clients that connect after
  // the first screenshots are published would see nothing until the next capture.
  const initialEvents: Array<{ type: string; payload: unknown }> = [];
  try {
    const redis = getRedis();
    const buffered = await redis.get(latestScreenshotKey(runId));
    if (buffered) {
      const parsed = JSON.parse(buffered) as { type: string; payload: unknown };
      initialEvents.push(parsed);
    }
  } catch {
    // Non-critical — client will get frames from pub/sub
  }

  // Subscribe to live screenshots and detect completion
  return createSSEStream({
    channel,
    lastEventId,
    initialEvents,
    onEvent: (event: WebSocketEvent) => {
      // Close stream when run completes
      if (event.type === "run:completed") {
        return true;
      }
    },
  });
}
