import { decryptToken } from "@/lib/vault/token";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { isGitHubAppConfigured } from "@/lib/github/app";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

interface GitHubOrg {
  login: string;
  id: number;
  avatar_url: string;
  description: string | null;
}

export interface OrgItem {
  login: string;
  id: number;
  avatarUrl: string;
  description: string | null;
  installed: boolean;
}

export const GET = route({}, async ({ workspaceId, session }) => {
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "github" },
    select: { access_token: true },
  });

  const accessToken = decryptToken(account?.access_token);
  if (!accessToken) {
    return apiError("No GitHub token", "NO_GITHUB_TOKEN", 401);
  }

  const res = await fetch("https://api.github.com/user/orgs?per_page=100", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    return apiError("Failed to fetch organizations", "GITHUB_API_ERROR", 502);
  }

  const orgs: GitHubOrg[] = await res.json();

  let installations: { accountLogin: string }[] = [];
  if (isGitHubAppConfigured()) {
    try {
      installations = await prisma.gitHubInstallation.findMany({
        where: { workspaceId },
        select: { accountLogin: true },
      });
    } catch {
      // Table may not exist yet — treat as no installations
    }
  }

  const installedLogins = new Set(installations.map((i) => i.accountLogin));

  const items: OrgItem[] = orgs.map((org) => ({
    login: org.login,
    id: org.id,
    avatarUrl: org.avatar_url,
    description: org.description,
    installed: installedLogins.has(org.login),
  }));

  return apiSuccess({
    orgs: items,
    appConfigured: isGitHubAppConfigured(),
    installUrl: isGitHubAppConfigured() ? "/api/github/install" : null,
  });
});
