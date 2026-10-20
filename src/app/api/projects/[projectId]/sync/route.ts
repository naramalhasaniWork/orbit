import { prisma } from "@/lib/db";
import { getIndexingQueue } from "@/lib/queue/queues";
import { requireQueueAvailable, withQueueTimeout } from "@/lib/queue/availability";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

interface SyncRequestBody {
  branch?: string;
  changedFiles?: string[];
}

export const POST = route(
  { permission: "projects.update" },
  async ({ req: request, params: { projectId }, workspaceId }) => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as SyncRequestBody;
    const branch = body.branch ?? project.defaultBranch;
    const changedFiles = body.changedFiles ?? [];
    const isIncremental = changedFiles.length > 0;

    await requireQueueAvailable();
    const queue = getIndexingQueue();
    const job = await withQueueTimeout(queue.add(
      `index-${projectId}`,
      {
        projectId,
        branch,
        changedFiles: isIncremental ? changedFiles : undefined,
        isIncremental,
      },
      {
        jobId: `index-${projectId}-${Date.now()}`,
      }
    ));

    return apiSuccess(
      {
        jobId: job.id,
        projectId,
        branch,
        isIncremental,
        status: "queued",
      },
      202
    );
  }
);

export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: {
      id: true,
      lastIndexedAt: true,
      framework: true,
      status: true,
    },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const nodeCount = await prisma.systemMapNode.count({
    where: { projectId },
  });

  const edgeCount = await prisma.systemMapEdge.count({
    where: { projectId },
  });

  // Check if there's an active indexing job
  await requireQueueAvailable();
  const queue = getIndexingQueue();
  const [activeJobs, waitingJobs] = await withQueueTimeout(
    Promise.all([queue.getActive(), queue.getWaiting()])
  );

  const isIndexing = [...activeJobs, ...waitingJobs].some((job) =>
    job.data.projectId === projectId
  );

  return apiSuccess({
    projectId,
    lastIndexedAt: project.lastIndexedAt,
    framework: project.framework,
    nodeCount,
    edgeCount,
    isIndexing,
  });
});
