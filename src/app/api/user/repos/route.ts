import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireAuth,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export const dynamic = "force-dynamic";

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
  owner: { login: string };
}

export interface RepoItem {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  language: string;
  stars: number;
  defaultBranch: string;
  updatedAt: string;
  isPrivate: boolean;
  url: string;
}

async function getGitHubToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
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
    const perPage = Math.min(parseInt(searchParams.get("per_page") ?? "30", 10), 100);
    const query = searchParams.get("q") ?? "";

    const url = query
      ? `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+in:name+user:@me&sort=updated&per_page=${perPage}&page=${page}`
      : `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GitHub API error:", response.status, errorText);
      return apiError(
        "Failed to fetch repositories from GitHub",
        "GITHUB_API_ERROR",
        response.status === 401 ? 401 : 502
      );
    }

    const raw = await response.json();
    const items: GitHubRepo[] = query ? raw.items : raw;

    const repos: RepoItem[] = items.map((repo) => ({
      id: String(repo.id),
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      language: repo.language ?? "Unknown",
      stars: repo.stargazers_count,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      isPrivate: repo.private,
      url: repo.html_url,
    }));

    return apiSuccess(repos);
  } catch (error) {
    return handleApiError(error);
  }
}
