/**
 * Commit Poller — checks each active project against GitHub for new commits.
 *
 * Called by the scheduler every 60s. For projects with autoSync enabled,
 * it compares the stored lastCommitSha with GitHub HEAD. If they differ,
 * it triggers re-indexing and optionally a test run.
 */

import { prisma } from "@/lib/db";
import { parseProjectSettings, patchProjectSettings } from "@/server/data/settings-repo";
import { resolveGitHubToken } from "@/lib/github/token";
import { getIndexingQueue } from "@/lib/queue/queues";
import { addDeterministicJob } from "@/lib/queue/deterministic-job";
import { githubRepoApiUrl, assertSafeRepoPath } from "@/lib/github/repo-paths";

interface CommitPollResult {
  projectId: string;
  repoSlug: string;
  status: "up-to-date" | "behind" | "triggered" | "skipped" | "error";
  newSha?: string;
  prevSha?: string;
  commitsBehind?: number;
  error?: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { date: string };
  };
}

/**
 * Fetch the latest commit on a branch from GitHub API.
 */
async function fetchLatestCommit(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<GitHubCommit | null> {
  const url = githubRepoApiUrl(owner, repo, ["commits", assertSafeRepoPath(branch, "branch")]);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Orbit-CI/1.0",
    },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<GitHubCommit>;
}

/**
 * Count commits between two SHAs on a branch.
 */
async function countCommitsBetween(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  token: string
): Promise<number> {
  const url = githubRepoApiUrl(owner, repo, ["compare", `${baseSha}...${headSha}`]);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Orbit-CI/1.0",
    },
  });

  if (!res.ok) return 0;

  const data = (await res.json()) as { ahead_by?: number };
  return data.ahead_by ?? 0;
}

/**
 * Poll a single project for new commits.
 */
export async function pollProjectCommits(
  projectId: string
): Promise<CommitPollResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      repoOwner: true,
      repoName: true,
      defaultBranch: true,
      settings: true,
      lastIndexedAt: true,
    },
  });

  if (!project) {
    return { projectId, repoSlug: "", status: "error", error: "Project not found" };
  }

  const settings = parseProjectSettings(project.settings);
  const repoSlug = `${project.repoOwner}/${project.repoName}`;

  if (!settings.autoSync) {
    return { projectId, repoSlug, status: "skipped" };
  }

  const tokenResult = await resolveGitHubToken(projectId);
  if (!tokenResult) {
    return { projectId, repoSlug, status: "error", error: "No GitHub token available" };
  }

  try {
    const latest = await fetchLatestCommit(
      project.repoOwner,
      project.repoName,
      project.defaultBranch,
      tokenResult.token
    );

    if (!latest) {
      return { projectId, repoSlug, status: "error", error: "Could not fetch latest commit" };
    }

    const prevSha = settings.lastCommitSha;

    // Always update the latest commit metadata in settings
    const commitInfo = {
      lastCommitSha: latest.sha,
      lastCommitAt: latest.commit.author.date,
      lastCommitMessage: latest.commit.message.split("\n")[0].slice(0, 200),
      commitsBehind: 0,
    };

    // No previous SHA recorded — just store and wait for next poll
    if (!prevSha) {
      await patchProjectSettings(projectId, commitInfo);
      return { projectId, repoSlug, status: "up-to-date", newSha: latest.sha };
    }

    // SHAs match — nothing to do
    if (prevSha === latest.sha) {
      return { projectId, repoSlug, status: "up-to-date", newSha: latest.sha };
    }

    // New commits detected — count how many behind
    const commitsBehind = await countCommitsBetween(
      project.repoOwner,
      project.repoName,
      prevSha,
      latest.sha,
      tokenResult.token
    );

    await patchProjectSettings(projectId, { ...commitInfo, commitsBehind });

    // Trigger incremental re-indexing
    await addDeterministicJob(
      getIndexingQueue(),
      `index-${projectId}-auto`,
      { projectId, branch: project.defaultBranch, isIncremental: true },
      `index:${projectId}:${latest.sha}`
    );

    console.log(
      `[CommitPoller] ${repoSlug}: ${commitsBehind} new commit(s) detected, re-indexing triggered`
    );

    return {
      projectId,
      repoSlug,
      status: "triggered",
      newSha: latest.sha,
      prevSha,
      commitsBehind,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[CommitPoller] ${repoSlug} error:`, error);
    return { projectId, repoSlug, status: "error", error };
  }
}

/**
 * Poll all active projects with autoSync enabled.
 * Called by the scheduler on every tick.
 */
export async function pollAllProjects(): Promise<CommitPollResult[]> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true },
  });

  // Filter to only autoSync-enabled projects without loading all settings upfront
  const results: CommitPollResult[] = [];

  for (const { id } of projects) {
    const result = await pollProjectCommits(id);
    if (result.status !== "skipped") {
      results.push(result);
    }
  }

  return results;
}
