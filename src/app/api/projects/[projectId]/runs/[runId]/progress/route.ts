import { NextRequest } from "next/server";
import { getServerSession } from "@/lib/utils/api";
import { forWorkspace } from "@/server/data/scope";
import { channels } from "@/lib/redis/pubsub";
import { createSSEStream } from "@/lib/sse/stream";
import type { WebSocketEvent } from "@/lib/websocket/channels";

export const dynamic = "force-dynamic";

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

  // Check if run already completed — no need for SSE
  const run = await project.db.testRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  if (terminalStatuses.has(run.status)) {
    // Return single event and close
    const encoder = new TextEncoder();
    const body = encoder.encode(
      `event: run:completed\ndata: ${JSON.stringify({ runId, status: run.status })}\n\n`
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
  const channel = channels.runProgress(runId);

  return createSSEStream({
    channel,
    lastEventId,
    onEvent: (event: WebSocketEvent) => {
      if (event.type === "run:completed") {
        return true;
      }
    },
  });
}
