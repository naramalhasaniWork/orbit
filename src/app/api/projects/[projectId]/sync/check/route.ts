import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { pollProjectCommits } from "@/services/github/commit-poller";
import { route } from "@/server/http/route";

/**
 * GET /api/projects/[projectId]/sync/check
 *
 * Immediately checks GitHub for new commits and updates project.settings.
 * Returns the current sync status: up-to-date, behind, or error.
 */
export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, settings: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const result = await pollProjectCommits(projectId);

  // Re-fetch settings after poll to return latest values
  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    select: { settings: true },
  });
  const settings = (updated?.settings ?? {}) as Record<string, unknown>;

  return apiSuccess({
    status: result.status,
    commitsBehind: (settings.commitsBehind as number) ?? 0,
    lastCommitSha: (settings.lastCommitSha as string) ?? null,
    lastCommitMessage: (settings.lastCommitMessage as string) ?? null,
    lastCommitAt: (settings.lastCommitAt as string) ?? null,
    error: result.error ?? null,
  });
});
