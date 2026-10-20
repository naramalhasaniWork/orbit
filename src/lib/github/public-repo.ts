import type { RepoItem } from "@/components/onboarding/onboarding-types";

export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** Accepts `https://github.com/o/r[.git|/tree/...]`, `github.com/o/r` or `o/r`. Returns null for anything else. */
export function parseGitHubRepoUrl(input: string): RepoRef | null {
  let value = input.trim();
  if (!value || /\s/.test(value)) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) return null;

  let path: string;
  if (hasScheme || /^(www\.)?github\.com\//i.test(value)) {
    try {
      const url = new URL(hasScheme ? value : `https://${value}`);
      if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
      path = url.pathname;
    } catch {
      return null;
    }
  } else {
    value = value.replace(/[?#].*$/, "");
    path = `/${value}`;
  }

  const [owner, rawRepo] = path.split("/").filter(Boolean);
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

export interface RateLimit {
  remaining: number;
  resetAt: Date;
}

export function readRateLimit(headers: Headers): RateLimit | null {
  const remaining = Number.parseInt(headers.get("x-ratelimit-remaining") ?? "", 10);
  const reset = Number.parseInt(headers.get("x-ratelimit-reset") ?? "", 10);
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return null;
  return { remaining, resetAt: new Date(reset * 1000) };
}

export function describeRateLimit(resetAt: Date | null, now: Date = new Date()): string {
  if (!resetAt) return "GitHub's rate limit for anonymous requests was reached. Try again in a few minutes, or connect GitHub.";
  const minutes = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 60_000));
  return `GitHub's rate limit for anonymous requests was reached. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}, or connect GitHub.`;
}

export type PublicRepoResult =
  | { ok: true; repo: RepoItem }
  | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM"; message: string; retryAt?: Date };

interface GitHubRepoJson {
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

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Look up a public repo through GitHub's API without a user token. */
export async function fetchPublicRepo(
  owner: string,
  repo: string,
  fetchImpl: FetchLike = fetch,
  token?: string
): Promise<PublicRepoResult> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    return { ok: false, code: "UPSTREAM", message: "Couldn't reach GitHub. Check your connection and try again." };
  }

  const limit = readRateLimit(res.headers);
  if (res.status === 429 || (res.status === 403 && limit?.remaining === 0)) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: describeRateLimit(limit?.resetAt ?? null),
      retryAt: limit?.resetAt,
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Repository not found. Orbit can only open public repositories from a link; connect GitHub for private ones.",
    };
  }
  if (!res.ok) {
    return { ok: false, code: "UPSTREAM", message: `GitHub returned an error (${res.status}). Try again shortly.` };
  }

  const json = (await res.json()) as GitHubRepoJson;
  if (json.private) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "That repository is private. Connect GitHub to use private repositories.",
    };
  }

  return {
    ok: true,
    repo: {
      id: String(json.id),
      name: json.name,
      fullName: json.full_name,
      owner: json.owner.login,
      ownerAvatar: json.owner.avatar_url,
      language: json.language ?? "Unknown",
      stars: json.stargazers_count,
      defaultBranch: json.default_branch,
      updatedAt: json.updated_at,
      isPrivate: false,
      url: json.html_url,
    },
  };
}
