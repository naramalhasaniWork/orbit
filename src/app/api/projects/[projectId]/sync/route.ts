import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getIndexingQueue } from "@/lib/queue/queues";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

interface SyncRequestBody {
  branch?: string;
  changedFiles?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

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

    const queue = getIndexingQueue();
    const job = await queue.add(
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
    );

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
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

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
    const queue = getIndexingQueue();
    const activeJobs = await queue.getActive();
    const waitingJobs = await queue.getWaiting();

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
  } catch (error) {
    return handleApiError(error);
  }
}
