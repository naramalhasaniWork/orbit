import { NextRequest } from "next/server";
import { getServerSession } from "@/lib/utils/api";
import { forWorkspace } from "@/server/data/scope";
import { channels } from "@/lib/redis/pubsub";
import { createSSEStream } from "@/lib/sse/stream";
import type { WebSocketEvent } from "@/lib/websocket/channels";

export const dynamic = "force-dynamic";

/**
 * SSE endpoint that streams live screenshots during test execution.
 * Replays missed frame pointers from the run:${runId}:screenshots stream on
 * reconnect; the images are fetched from the frames route.
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

  const run = await project.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  // If run already completed, return artifacts instead of streaming
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  if (terminalStatuses.has(run.status)) {
    const artifacts = await project.runArtifact.findMany({
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

  // Subscribe to live screenshots and detect completion
  return createSSEStream({
    channel,
    lastEventId,
    // A viewer joining mid-run starts from the newest frame, not a blank screen.
    latestCount: 1,
    onEvent: (event: WebSocketEvent) => {
      // Close stream when run completes
      if (event.type === "run:completed") {
        return true;
      }
    },
  });
}
