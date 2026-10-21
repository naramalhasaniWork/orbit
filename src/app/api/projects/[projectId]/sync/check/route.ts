import { parseProjectSettings } from "@/server/data/settings-repo";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { pollProjectCommits } from "@/services/github/commit-poller";
import { route } from "@/server/http/route";

/**
 * GET /api/projects/[projectId]/sync/check
 *
 * Immediately checks GitHub for new commits and updates project.settings.
 * Returns the current sync status: up-to-date, behind, or error.
 */
export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, settings: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const result = await pollProjectCommits(projectId);

  // Re-fetch settings after poll to return latest values
  const updated = await db.project.findUnique({
    where: { id: projectId },
    select: { settings: true },
  });
  const settings = parseProjectSettings(updated?.settings);

  return apiSuccess({
    status: result.status,
    commitsBehind: settings.commitsBehind ?? 0,
    lastCommitSha: settings.lastCommitSha ?? null,
    lastCommitMessage: settings.lastCommitMessage ?? null,
    lastCommitAt: settings.lastCommitAt ?? null,
    error: result.error ?? null,
  });
});
