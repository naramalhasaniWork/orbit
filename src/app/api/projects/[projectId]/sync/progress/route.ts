import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/utils/api";
import { getIndexingQueue } from "@/lib/queue/queues";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        const queue = getIndexingQueue();
        const activeJobs = await queue.getActive();
        const waitingJobs = await queue.getWaiting();
        const completedJobs = await queue.getCompleted();
        const failedJobs = await queue.getFailed();

        const projectJobs = [...activeJobs, ...waitingJobs].filter(
          (j) => j.data.projectId === projectId
        );
        const projectCompleted = completedJobs.filter(
          (j) => j.data.projectId === projectId
        );
        const projectFailed = failedJobs.filter(
          (j) => j.data.projectId === projectId
        );

        if (projectJobs.length > 0) {
          const job = projectJobs[0];
          const progress = typeof job.progress === "number" ? job.progress : 0;
          send({ status: "indexing", progress, phase: job.data.phase ?? "processing" });
        } else if (projectFailed.length > 0) {
          send({ status: "failed", error: "Indexing failed" });
          controller.close();
          return true;
        } else if (projectCompleted.length > 0) {
          const nodeCount = await prisma.systemMapNode.count({ where: { projectId } });
          send({ status: "complete", nodeCount });
          controller.close();
          return true;
        } else {
          // No jobs found — check if project has been indexed
          const proj = await prisma.project.findFirst({
            where: { id: projectId },
            select: { lastIndexedAt: true },
          });
          if (proj?.lastIndexedAt) {
            const nodeCount = await prisma.systemMapNode.count({ where: { projectId } });
            send({ status: "complete", nodeCount });
            controller.close();
            return true;
          }
          send({ status: "waiting", progress: 0 });
        }
        return false;
      };

      // Poll every 2 seconds for up to 5 minutes
      for (let i = 0; i < 150; i++) {
        try {
          const done = await poll();
          if (done) return;
        } catch {
          send({ status: "error", error: "Failed to check progress" });
          controller.close();
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      send({ status: "timeout" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
