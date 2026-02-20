import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/utils/api";
import { channels } from "@/lib/redis/pubsub";
import { createSSEStream } from "@/lib/sse/stream";
import type { WebSocketEvent } from "@/lib/websocket/channels";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: session.workspaceId },
    select: { id: true, lastIndexedAt: true },
  });

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  const lastEventId =
    request.headers.get("Last-Event-ID") ??
    request.nextUrl.searchParams.get("lastEventId");

  const channel = channels.indexingProgress(projectId);

  return createSSEStream({
    channel,
    lastEventId,
    onEvent: (event: WebSocketEvent) => {
      // Close stream on terminal events
      if (
        event.type === "indexing:completed" ||
        event.type === "indexing:failed"
      ) {
        return true;
      }
    },
  });
}
