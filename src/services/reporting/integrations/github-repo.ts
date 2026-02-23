import { resolveGitHubToken, getRepoInfo } from "@/lib/github/token";

interface PRDiffFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

interface GitHubIssueResult {
  success: boolean;
  issueNumber: number;
  issueUrl: string;
}

/**
 * Fetch the list of changed files in a pull request.
 * Used for diff-aware test scoping.
 */
export async function fetchPRDiff(
  projectId: string,
  prNumber: number
): Promise<PRDiffFile[]> {
  const resolved = await resolveGitHubToken(projectId);
  if (!resolved) return [];

  const repoInfo = await getRepoInfo(projectId);
  if (!repoInfo) return [];

  const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}/files?per_page=100`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      console.warn(`[github] Failed to fetch PR diff: ${response.status}`);
      return [];
    }

    const files = (await response.json()) as Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;

    return files.map((f) => ({
      filename: f.filename,
      status: f.status as PRDiffFile["status"],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  } catch (error) {
    console.warn("[github] PR diff request failed:", error);
    return [];
  }
}

/**
 * Fetch file content from a specific commit/branch.
 */
export async function fetchFileContent(
  projectId: string,
  filePath: string,
  ref?: string
): Promise<string | null> {
  const resolved = await resolveGitHubToken(projectId);
  if (!resolved) return null;

  const repoInfo = await getRepoInfo(projectId);
  if (!repoInfo) return null;

  const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${encodeURIComponent(filePath)}${refParam}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Create a GitHub issue for a discovered bug.
 */
export async function createGitHubIssue(
  projectId: string,
  title: string,
  body: string,
  labels: string[] = ["orbit-discovered", "bug"]
): Promise<GitHubIssueResult> {
  const resolved = await resolveGitHubToken(projectId);
  if (!resolved) {
    return { success: false, issueNumber: 0, issueUrl: "" };
  }

  const repoInfo = await getRepoInfo(projectId);
  if (!repoInfo) {
    return { success: false, issueNumber: 0, issueUrl: "" };
  }

  const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body, labels }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[github] Issue creation failed (${response.status}): ${errorText}`
      );
      return { success: false, issueNumber: 0, issueUrl: "" };
    }

    const data = (await response.json()) as {
      number: number;
      html_url: string;
    };

    return {
      success: true,
      issueNumber: data.number,
      issueUrl: data.html_url,
    };
  } catch (error) {
    console.warn("[github] Issue creation failed:", error);
    return { success: false, issueNumber: 0, issueUrl: "" };
  }
}

/**
 * Get commit diff (changed files) for diff-aware scoping on push events.
 */
export async function fetchCommitDiff(
  projectId: string,
  commitSha: string
): Promise<string[]> {
  const resolved = await resolveGitHubToken(projectId);
  if (!resolved) return [];

  const repoInfo = await getRepoInfo(projectId);
  if (!repoInfo) return [];

  const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits/${commitSha}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as {
      files?: Array<{ filename: string }>;
    };

    return data.files?.map((f) => f.filename) ?? [];
  } catch {
    return [];
  }
}

export type { PRDiffFile, GitHubIssueResult };
