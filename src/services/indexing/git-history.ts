import { prisma } from "@/lib/db";
import { patchProjectSettings } from "@/server/data/settings-repo";
import { githubRepoApiUrl, assertSafeRepoPath } from "@/lib/github/repo-paths";

// ============================================================
// Types
// ============================================================

export interface FileChange {
  filePath: string;
  commitHash: string;
  date: string;
  message: string;
  changeCount: number;
}

export interface FileChangeFrequency {
  commitCount: number;
  totalChanges: number;
  lastChanged: string;
  recentCommitMessages: string[];
}

interface GitHubCommitFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface GitHubCommitItem {
  sha: string;
  commit: {
    message: string;
    committer: {
      date: string;
    };
  };
  files?: GitHubCommitFile[];
}

// ============================================================
// Parsing
// ============================================================

/**
 * Parse git log --stat formatted output into structured FileChange records.
 *
 * Expected format per commit block:
 *   commit <hash>
 *   Date:   <date>
 *
 *       <message>
 *
 *    file/path | <num> +++---
 *    ...
 *    N files changed, X insertions(+), Y deletions(-)
 */
export function parseGitLogOutput(output: string): FileChange[] {
  if (!output.trim()) return [];

  const changes: FileChange[] = [];
  const commitBlocks = output.split(/^commit /m).filter(Boolean);

  for (const block of commitBlocks) {
    const lines = block.split("\n");

    // First line is the hash (rest of "commit <hash>" after split)
    const commitHash = lines[0]?.trim().slice(0, 40) ?? "";
    if (!commitHash) continue;

    // Find date line
    const dateLine = lines.find((l) => l.startsWith("Date:"));
    const date = dateLine?.replace("Date:", "").trim() ?? "";

    // Find message — lines between blank line after headers and stat section
    const headerEnd = lines.findIndex(
      (l, i) => i > 0 && l.trim() === "" && lines[i - 1]?.startsWith("Date:")
    );
    const messageLines: string[] = [];
    if (headerEnd >= 0) {
      for (let i = headerEnd + 1; i < lines.length; i++) {
        const trimmed = lines[i]?.trim() ?? "";
        if (trimmed === "") break;
        messageLines.push(trimmed);
      }
    }
    const message = messageLines.join(" ");

    // Find stat lines: "  path/to/file | 5 ++-"
    const statRegex = /^\s+(.+?)\s+\|\s+(\d+)/;
    for (const line of lines) {
      const match = statRegex.exec(line);
      if (match) {
        const filePath = match[1]?.trim() ?? "";
        const changeCount = parseInt(match[2] ?? "0", 10);
        if (filePath && !filePath.includes("files changed")) {
          changes.push({ filePath, commitHash, date, message, changeCount });
        }
      }
    }
  }

  return changes;
}

// ============================================================
// Aggregation
// ============================================================

/**
 * Aggregate FileChange records by file path into frequency summaries.
 */
export function aggregateChangeFrequency(
  changes: FileChange[]
): Map<string, FileChangeFrequency> {
  const freq = new Map<string, FileChangeFrequency>();

  for (const change of changes) {
    const existing = freq.get(change.filePath);

    if (existing) {
      existing.commitCount++;
      existing.totalChanges += change.changeCount;
      if (change.date > existing.lastChanged) {
        existing.lastChanged = change.date;
      }
      if (
        existing.recentCommitMessages.length < 5 &&
        change.message &&
        !existing.recentCommitMessages.includes(change.message)
      ) {
        existing.recentCommitMessages.push(change.message);
      }
    } else {
      freq.set(change.filePath, {
        commitCount: 1,
        totalChanges: change.changeCount,
        lastChanged: change.date,
        recentCommitMessages: change.message ? [change.message] : [],
      });
    }
  }

  return freq;
}

// ============================================================
// Project Git History Retrieval
// ============================================================

/**
 * Read stored git history from the project's settings metadata.
 */
export async function getGitHistoryForProject(
  projectId: string,
  daysSince?: number
): Promise<FileChange[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { settings: true },
  });

  const settings = (project?.settings ?? {}) as Record<string, unknown>;
  const gitHistory = settings.gitHistory as
    | { changes?: FileChange[] }
    | undefined;

  const changes = gitHistory?.changes ?? [];

  if (!daysSince) return changes;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysSince);
  const cutoffStr = cutoff.toISOString();

  return changes.filter((c) => c.date >= cutoffStr);
}

// ============================================================
// GitHub Commits Fetcher
// ============================================================

/**
 * Fetch recent commits from GitHub API and convert to FileChange records.
 */
export async function fetchGitHubCommits(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  daysSince: number = 30
): Promise<FileChange[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysSince);

  const url =
    githubRepoApiUrl(owner, repo, ["commits"], {
      sha: assertSafeRepoPath(branch, "branch"),
      since: since.toISOString(),
      per_page: "100",
    });

  const listRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!listRes.ok) {
    throw new Error(`GitHub commits API error: ${listRes.status}`);
  }

  const commits = (await listRes.json()) as GitHubCommitItem[];
  const changes: FileChange[] = [];

  // Fetch file-level detail for each commit (cap at 50 to avoid rate limits)
  const commitsToFetch = commits.slice(0, 50);

  for (const commit of commitsToFetch) {
    const detailUrl =
      githubRepoApiUrl(owner, repo, ["commits", commit.sha]);
    const detailRes = await fetch(detailUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!detailRes.ok) continue;

    const detail = (await detailRes.json()) as GitHubCommitItem;
    const files = detail.files ?? [];

    for (const file of files) {
      changes.push({
        filePath: file.filename,
        commitHash: commit.sha,
        date: commit.commit.committer.date,
        message: commit.commit.message.split("\n")[0] ?? "",
        changeCount: file.changes,
      });
    }
  }

  return changes;
}

// ============================================================
// Pipeline Integration
// ============================================================

/**
 * Collect git history from GitHub and store in project settings.
 * Returns a human-readable status message.
 */
export async function collectAndStoreGitHistory(
  projectId: string,
  repoOwner: string,
  repoName: string,
  branch: string
): Promise<string> {
  const { resolveGitHubToken } = await import("@/lib/github/token");
  const tokenResult = await resolveGitHubToken(projectId);
  if (!tokenResult) return "Skipped git history (no token available)";

  const gitChanges = await fetchGitHubCommits(
    repoOwner,
    repoName,
    branch,
    tokenResult.token,
    30
  );

  const changeFrequency = aggregateChangeFrequency(gitChanges);
  const frequencyObj = Object.fromEntries(changeFrequency);

  await patchProjectSettings(projectId, {
    gitHistory: {
      changes: gitChanges,
      changeFrequency: frequencyObj,
      collectedAt: new Date().toISOString(),
    },
  });

  return `Collected ${gitChanges.length} file changes from ${changeFrequency.size} files`;
}
