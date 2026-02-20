import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/utils/api";
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

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: session.workspaceId },
    select: { id: true },
  });

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  // Check if run already completed — no need for SSE
  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId },
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

  const lastEventId = request.headers.get("Last-Event-ID");
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
