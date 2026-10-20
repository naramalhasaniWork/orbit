import { resolveGitHubToken, getRepoInfo } from "@/lib/github/token";

const GITHUB_API = "https://api.github.com";

interface GitHubContext {
  token: string;
  owner: string;
  repo: string;
}

export interface CheckRunInput {
  name: string;
  commitSha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  title: string;
  summary: string;
  /** Update this check run instead of creating one */
  checkRunId?: string | null;
}

async function githubContext(projectId: string): Promise<GitHubContext | null> {
  const resolved = await resolveGitHubToken(projectId);
  if (!resolved) return null;
  const repoInfo = await getRepoInfo(projectId);
  if (!repoInfo) return null;
  return { token: resolved.token, owner: repoInfo.owner, repo: repoInfo.repo };
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/** Create or update a check run. Returns its id, or null when GitHub is unavailable. */
export async function upsertCheckRun(projectId: string, input: CheckRunInput): Promise<string | null> {
  const ctx = await githubContext(projectId);
  if (!ctx) {
    console.warn("[github] No GitHub token or repo info, skipping check run");
    return null;
  }

  const base = `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/check-runs`;
  const body: Record<string, unknown> = {
    name: input.name,
    status: input.status,
    output: { title: input.title, summary: input.summary },
  };
  if (!input.checkRunId) body.head_sha = input.commitSha;
  if (input.status === "completed") body.conclusion = input.conclusion ?? "neutral";

  try {
    const response = await fetch(input.checkRunId ? `${base}/${input.checkRunId}` : base, {
      method: input.checkRunId ? "PATCH" : "POST",
      headers: headers(ctx.token),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(`[github] Check run failed (${response.status}): ${await response.text()}`);
      return null;
    }
    const data = (await response.json()) as { id: number };
    return String(data.id);
  } catch (error) {
    console.warn("[github] Check run request failed:", error);
    return null;
  }
}

/**
 * Open pull requests whose head is this commit (GitHub commits/{sha}/pulls).
 * Used to map a provider deployment back to a PR when no PR webhook created it.
 */
export async function findOpenPullRequestsForCommit(
  projectId: string,
  commitSha: string
): Promise<Array<{ number: number; branch: string }>> {
  const ctx = await githubContext(projectId);
  if (!ctx) return [];
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/commits/${encodeURIComponent(commitSha)}/pulls`,
      { headers: headers(ctx.token) }
    );
    if (!response.ok) return [];
    const pulls = (await response.json()) as Array<{ number: number; state: string; head: { ref: string; sha: string } }>;
    return pulls
      .filter((p) => p.state === "open" && p.head.sha.toLowerCase() === commitSha.toLowerCase())
      .map((p) => ({ number: p.number, branch: p.head.ref }));
  } catch {
    return [];
  }
}
