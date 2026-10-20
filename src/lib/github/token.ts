import { decryptToken } from "@/lib/vault/token";
import { prisma } from "@/lib/db";
import { isGitHubAppConfigured, getInstallationToken } from "@/lib/github/app";
import { isSelfHosted } from "@/lib/self-host";

/**
 * Resolve a GitHub API token for a project.
 *
 * Priority:
 * 1. GitHub App installation token (works for org repos with restricted access)
 * 2. Workspace member's OAuth token
 * 3. GITHUB_TOKEN env var, self-hosted only (see below)
 *
 * The env token belongs to the operator, not the workspace, so on hosted Orbit it is never
 * used: any workspace could otherwise read whatever that token can. On a self-hosted
 * instance it is used for public repos, or for any repo when ORBIT_GITHUB_TOKEN_FALLBACK=true.
 */
export async function resolveGitHubToken(
  projectId: string
): Promise<{ token: string; source: "installation" | "oauth" | "env" } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, repoName: true, workspaceId: true },
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

  const oauthToken = decryptToken(member?.user?.accounts?.[0]?.access_token);
  if (oauthToken) {
    return { token: oauthToken, source: "oauth" };
  }

  // Last resort: the operator's env token, self-hosted only
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken && isSelfHosted()) {
    const explicit = process.env.ORBIT_GITHUB_TOKEN_FALLBACK === "true";
    if (explicit || (await isPublicRepo(project.repoOwner, project.repoName))) {
      return { token: envToken, source: "env" };
    }
  }

  return null;
}

/** Unauthenticated probe: GitHub answers 404 for repos that are private or missing. */
async function isPublicRepo(owner: string, repo: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
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
