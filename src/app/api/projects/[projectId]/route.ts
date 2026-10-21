import { getIndexingQueue } from "@/lib/queue/queues";
import { redactSettingsOf, userSettingsPatch } from "@/lib/integrations/redact";
import { patchProjectSettings } from "@/server/data/settings-repo";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  // Enrich with indexing status data
  const [nodeCount, edgeCount, indexingStatus] = await Promise.all([
    db.systemMapNode.count({ where: { projectId } }),
    db.systemMapEdge.count({ where: { projectId } }),
    getIndexingStatus(projectId, project.lastIndexedAt),
  ]);

  return apiSuccess({
    ...redactSettingsOf(project),
    indexingStatus,
    nodeCount,
    edgeCount,
  });
});

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

export const PATCH = route(
  { permission: "projects.update" },
  async ({ req: request, params: { projectId }, workspaceId, db }) => {
    const project = await db.project(projectId);

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
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "active") {
        data.deletedAt = null;
      }
    }

    // Merged atomically: keys the client did not send (and server-written ones) survive
    if (body.settings !== undefined) {
      await patchProjectSettings(projectId, userSettingsPatch(body.settings));
    }

    const updated = await db.project.update({
      where: { id: projectId },
      data,
    });

    return apiSuccess(redactSettingsOf(updated));
  }
);

// ============================================================
// DELETE /api/projects/[projectId]
// ============================================================

export const DELETE = route(
  { permission: "projects.delete" },
  async ({ params: { projectId }, workspaceId, db }) => {
    const project = await db.project(projectId);

    await db.project.update({
      where: { id: projectId },
      data: { status: "archived", deletedAt: new Date() },
    });

    return apiSuccess({ archived: true });
  }
);
