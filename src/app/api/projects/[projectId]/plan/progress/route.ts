import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/utils/api";
import { channels } from "@/lib/redis/pubsub";
import { createSSEStream } from "@/lib/sse/stream";
import { readPlanJobState } from "@/services/planning/plan-jobs";
import type { WebSocketEvent } from "@/lib/websocket/channels";

export const dynamic = "force-dynamic";

/** Streams plan:progress / plan:completed / plan:failed for a project. */
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
    select: { id: true },
  });
  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  // Replay the current state so a client that reconnects mid-generation
  // (or after a reload) is immediately up to date.
  const current = await readPlanJobState(projectId).catch(() => null);
  const initialEvents = current
    ? [{
        type: current.status === "completed" ? "plan:completed" : current.status === "failed" ? "plan:failed" : "plan:progress",
        payload: current,
      }]
    : [];

  return createSSEStream({
    channel: channels.planProgress(projectId),
    lastEventId: request.headers.get("Last-Event-ID") ?? request.nextUrl.searchParams.get("lastEventId"),
    initialEvents,
    onEvent: (event: WebSocketEvent) =>
      event.type === "plan:completed" || event.type === "plan:failed" ? true : undefined,
  });
}
