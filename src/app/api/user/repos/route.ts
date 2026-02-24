import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  isGitHubAppConfigured,
  listInstallationRepos,
} from "@/lib/github/app";

export const dynamic = "force-dynamic";

export interface RepoItem {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar?: string;
  language: string;
  stars: number;
  defaultBranch: string;
  updatedAt: string;
  isPrivate: boolean;
  url: string;
  source: "oauth" | "installation";
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  default_branch: string;
  updated_at: string;
  html_url: string;
  owner: { login: string; avatar_url?: string };
}

function toRepoItem(repo: GitHubRepo, source: "oauth" | "installation"): RepoItem {
  return {
    id: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    ownerAvatar: repo.owner.avatar_url,
    language: repo.language ?? "Unknown",
    stars: repo.stargazers_count,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    isPrivate: repo.private,
    url: repo.html_url,
    source,
  };
}

async function getGitHubToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token ?? null;
}

async function fetchOAuthRepos(
  token: string,
  query: string,
  page: number,
  perPage: number
): Promise<RepoItem[]> {
  const url = query
    ? `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+in:name&sort=updated&per_page=${perPage}&page=${page}`
    : `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) return [];

  const raw = await response.json();
  const items: GitHubRepo[] = query ? raw.items ?? [] : raw;
  return items.map((r) => toRepoItem(r, "oauth"));
}

async function fetchInstallationRepos(
  workspaceId: string,
  query: string
): Promise<RepoItem[]> {
  if (!isGitHubAppConfigured()) return [];

  let installations: { installationId: number }[];
  try {
    installations = await prisma.gitHubInstallation.findMany({
      where: { workspaceId },
      select: { installationId: true },
    });
  } catch {
    // Table may not exist yet — gracefully skip
    return [];
  }

  if (installations.length === 0) return [];

  const results: RepoItem[] = [];

  for (const inst of installations) {
    try {
      const repos = await listInstallationRepos(inst.installationId);
      const mapped = repos.map((r) => toRepoItem(r, "installation"));

      if (query) {
        const lower = query.toLowerCase();
        results.push(
          ...mapped.filter(
            (r) =>
              r.name.toLowerCase().includes(lower) ||
              r.fullName.toLowerCase().includes(lower)
          )
        );
      } else {
        results.push(...mapped);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch repos for installation ${inst.installationId}:`, msg);

      // Auto-prune stale installations (uninstalled on GitHub)
      if (msg.includes("404")) {
        prisma.gitHubInstallation
          .deleteMany({ where: { workspaceId, installationId: inst.installationId } })
          .catch(() => {});
      }
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  try {
    const { session, workspaceId } = await requireWorkspace();
    const token = await getGitHubToken(session.user.id);

    if (!token) {
      return apiError(
        "No GitHub access token found. Please reconnect your GitHub account.",
        "NO_GITHUB_TOKEN",
        401
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = Math.min(
      parseInt(searchParams.get("per_page") ?? "30", 10),
      100
    );
    const query = searchParams.get("q") ?? "";

    const [oauthRepos, installationRepos] = await Promise.all([
      fetchOAuthRepos(token, query, page, perPage),
      fetchInstallationRepos(workspaceId, query),
    ]);

    const seen = new Set<string>();
    const merged: RepoItem[] = [];

    for (const repo of [...installationRepos, ...oauthRepos]) {
      if (!seen.has(repo.id)) {
        seen.add(repo.id);
        merged.push(repo);
      }
    }

    merged.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return apiSuccess(merged);
  } catch (error) {
    return handleApiError(error);
  }
}
