import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getIndexingQueue } from "@/lib/queue/queues";
import { requirePermission } from "@/lib/auth/rbac";
import { mergeUserSettings, redactSettingsOf } from "@/lib/integrations/redact";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
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

    // Enrich with indexing status data
    const [nodeCount, edgeCount, indexingStatus] = await Promise.all([
      prisma.systemMapNode.count({ where: { projectId } }),
      prisma.systemMapEdge.count({ where: { projectId } }),
      getIndexingStatus(projectId, project.lastIndexedAt),
    ]);

    return apiSuccess({
      ...redactSettingsOf(project),
      indexingStatus,
      nodeCount,
      edgeCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getIndexingStatus(
  projectId: string,
  lastIndexedAt: Date | null
): Promise<"not_started" | "in_progress" | "completed" | "failed"> {
  try {
    const queue = getIndexingQueue();
    const [activeJobs, waitingJobs] = await Promise.all([
      queue.getActive(),
      queue.getWaiting(),
    ]);

    const isIndexing = [...activeJobs, ...waitingJobs].some(
      (job) => job.data.projectId === projectId
    );

    if (isIndexing) return "in_progress";

    // Check if the most recent job failed
    const failedJobs = await queue.getFailed(0, 10);
    const recentFailure = failedJobs.find(
      (job) => job.data.projectId === projectId
    );

    if (recentFailure && !lastIndexedAt) return "failed";
    if (recentFailure && lastIndexedAt && recentFailure.timestamp > lastIndexedAt.getTime()) {
      return "failed";
    }
  } catch {
    // Queue unavailable -- fall back to DB state
  }

  if (lastIndexedAt) return "completed";
  return "not_started";
}

interface UpdateProjectBody {
  name?: string;
  defaultBranch?: string;
  onboardingCompleted?: boolean;
  settings?: Record<string, unknown>;
  status?: "active" | "archived";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    // RBAC: require projects.update permission
    await requirePermission(workspaceId, "projects.update");

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, settings: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as UpdateProjectBody;
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      data.name = body.name;
    }
    if (body.defaultBranch !== undefined) {
      data.defaultBranch = body.defaultBranch;
    }
    if (body.onboardingCompleted !== undefined) {
      data.onboardingCompleted = body.onboardingCompleted;
    }
    if (body.settings !== undefined) {
      data.settings = mergeUserSettings(project.settings, body.settings);
    }
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "active") {
        data.deletedAt = null;
      }
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
    });

    return apiSuccess(redactSettingsOf(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// DELETE /api/projects/[projectId]
// ============================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    await requirePermission(workspaceId, "projects.update");

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "archived", deletedAt: new Date() },
    });

    return apiSuccess({ archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
