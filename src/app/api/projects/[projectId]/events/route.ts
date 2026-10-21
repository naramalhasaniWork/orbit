import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/utils/api";
import { channels } from "@/lib/redis/pubsub";
import { createSSEStream } from "@/lib/sse/stream";

export const dynamic = "force-dynamic";

/**
 * Project-level SSE endpoint.
 * Streams run:started, run:completed, and test:completed events
 * for the entire project — used by dashboard components to
 * receive live updates without polling.
 *
 * Unlike run-specific streams, this never auto-closes (until
 * the max duration or client disconnect).
 */
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

  const lastEventId =
    request.headers.get("Last-Event-ID") ??
    request.nextUrl.searchParams.get("lastEventId");
  const channel = channels.projectEvents(projectId);

  return createSSEStream({
    channel,
    lastEventId,
    // No onEvent — project stream stays open indefinitely
  });
}
