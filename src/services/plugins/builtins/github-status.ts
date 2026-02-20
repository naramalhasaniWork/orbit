/**
 * GitHub Status Plugin
 *
 * Posts GitHub commit status checks when test runs start and complete.
 * Requires GitHub integration to be configured in workspace settings.
 */

import type {
  PluginDefinition,
  RunContext,
  RunResults,
} from "@/services/plugins/runtime";

type GithubState = "pending" | "success" | "failure" | "error";

interface StatusPayload {
  state: GithubState;
  target_url?: string;
  description: string;
  context: string;
}

async function postGithubStatus(
  repoOwner: string,
  repoName: string,
  commitSha: string,
  payload: StatusPayload,
  token: string
): Promise<void> {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/statuses/${commitSha}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub status API failed: ${response.status} — ${body}`);
  }
}

function parseRepoFromContext(context: RunContext): {
  owner: string;
  repo: string;
} | null {
  // Attempt to parse owner/repo from project metadata
  // In production, this would come from the integration config
  const projectName = context.projectName;
  const parts = projectName.split("/");
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

export const githubStatusPlugin: PluginDefinition = {
  name: "github-status",
  version: "1.0.0",
  description: "Posts GitHub commit status checks for test runs",
  defaultConfig: {
    contextName: "Orbit Tests",
    targetUrlBase: "",
  },
  hooks: {
    beforeRun: async (context: RunContext) => {
      if (!context.commitSha) return;

      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        console.warn("[github-status] No GitHub token configured, skipping status");
        return;
      }

      const repo = parseRepoFromContext(context);
      if (!repo) {
        console.warn("[github-status] Could not parse repo owner/name from project");
        return;
      }

      await postGithubStatus(repo.owner, repo.repo, context.commitSha, {
        state: "pending",
        description: `Orbit ${context.mode} run in progress...`,
        context: "Orbit Tests",
      }, token);
    },

    afterRun: async (context: RunContext, results: RunResults) => {
      if (!context.commitSha) return;

      const token = process.env.GITHUB_TOKEN;
      if (!token) return;

      const repo = parseRepoFromContext(context);
      if (!repo) return;

      const passRate = results.totalTests > 0
        ? Math.round((results.passed / results.totalTests) * 100)
        : 0;

      const state: GithubState =
        results.status === "completed" && results.failed === 0
          ? "success"
          : results.status === "failed"
            ? "error"
            : "failure";

      const description =
        state === "success"
          ? `All ${results.totalTests} tests passed (${passRate}%)`
          : `${results.failed} of ${results.totalTests} tests failed (${passRate}%)`;

      await postGithubStatus(repo.owner, repo.repo, context.commitSha, {
        state,
        description,
        context: "Orbit Tests",
      }, token);
    },
  },
};
