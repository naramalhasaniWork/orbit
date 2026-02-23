import { prisma } from "@/lib/db";
import { isGitHubAppConfigured, getInstallationToken } from "@/lib/github/app";

/**
 * Resolve a GitHub API token for a project.
 *
 * Priority:
 * 1. GitHub App installation token (works for org repos with restricted access)
 * 2. Workspace member's OAuth token
 * 3. GITHUB_TOKEN env var fallback
 */
export async function resolveGitHubToken(
  projectId: string
): Promise<{ token: string; source: "installation" | "oauth" | "env" } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, workspaceId: true },
  });

  if (!project) return null;

  // Try GitHub App installation token first (best for org repos)
  if (isGitHubAppConfigured() && project.workspaceId) {
    const installation = await prisma.gitHubInstallation.findFirst({
      where: {
        workspaceId: project.workspaceId,
        accountLogin: project.repoOwner,
      },
      select: { installationId: true },
    });

    if (installation) {
      try {
        const token = await getInstallationToken(installation.installationId);
        return { token, source: "installation" };
      } catch (err) {
        console.warn(
          `[github-token] Installation token failed for ${project.repoOwner}:`,
          err
        );
      }
    }
  }

  // Fallback to workspace member OAuth token
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      user: {
        select: {
          accounts: {
            where: { provider: "github" },
            select: { access_token: true },
            take: 1,
          },
        },
      },
    },
  });

  const oauthToken = member?.user?.accounts?.[0]?.access_token;
  if (oauthToken) {
    return { token: oauthToken, source: "oauth" };
  }

  // Last resort: env var
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  return null;
}

export async function getRepoInfo(
  projectId: string
): Promise<{ owner: string; repo: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, repoName: true },
  });

  if (!project?.repoOwner || !project?.repoName) return null;
  return { owner: project.repoOwner, repo: project.repoName };
}
