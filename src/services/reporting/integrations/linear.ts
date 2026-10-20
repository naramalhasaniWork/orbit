import { prisma } from "@/lib/db";
import { openSecret } from "@/lib/integrations/secret-field";
import type { BugReport, RunSummary } from "@/agents/schemas/run-summary";

interface LinearIssueResult {
  success: boolean;
  issueId: string;
  issueUrl: string;
  title: string;
}

interface LinearCommentResult {
  success: boolean;
  commentId: string;
  issueId: string;
}

function formatBugReportAsDescription(report: BugReport): string {
  let desc = `## ${report.title}\n\n`;
  desc += `**Severity:** ${report.severity.toUpperCase()}\n\n`;
  desc += `${report.description}\n\n`;

  desc += `### Steps to Reproduce\n`;
  for (let i = 0; i < report.stepsToReproduce.length; i++) {
    desc += `${i + 1}. ${report.stepsToReproduce[i]}\n`;
  }

  desc += `\n### Expected Behavior\n${report.expectedBehavior}\n`;
  desc += `\n### Actual Behavior\n${report.actualBehavior}\n`;

  if (report.suggestedFix) {
    desc += `\n### Suggested Fix\n${report.suggestedFix}\n`;
  }

  if (report.affectedRoute) {
    desc += "\n**Affected Route:** `" + report.affectedRoute + "`\n";
  }

  if (report.screenshotUrls.length > 0) {
    desc += `\n### Screenshots\n`;
    for (const url of report.screenshotUrls) {
      desc += `- ${url}\n`;
    }
  }

  desc += `\n---\n*Created by Orbit*`;
  return desc;
}

function formatRunSummaryAsComment(summary: RunSummary): string {
  const passRate =
    summary.totalTests > 0
      ? ((summary.passed / summary.totalTests) * 100).toFixed(1)
      : "0.0";

  let comment = `**Orbit Test Run Update**\n\n`;
  comment += `${summary.totalTests} tests | ${summary.passed} passed | ${summary.failed} failed | Pass rate: ${passRate}%\n\n`;
  comment += `> ${summary.summary}\n`;

  if (summary.failures.length > 0) {
    comment += `\n**Top Failures:**\n`;
    for (const failure of summary.failures.slice(0, 3)) {
      comment += `- [${failure.severity}] ${failure.testName}: ${failure.explanation}\n`;
    }
  }

  return comment;
}

const SEVERITY_TO_PRIORITY: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  info: 4,
};

/** Linear credentials as the Settings integration stores them (project, then workspace, then env). */
export async function getLinearConfig(
  projectId: string
): Promise<{ apiKey: string; teamId: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      settings: true,
      workspace: { select: { settings: true } },
    },
  });

  if (!project) return null;

  const projectSettings = project.settings as Record<string, unknown>;
  const workspaceSettings = project.workspace.settings as Record<
    string,
    unknown
  >;

  const apiKey =
    openSecret(projectSettings?.linearApiKey) ??
    openSecret(workspaceSettings?.linearApiKey) ??
    process.env.LINEAR_API_KEY ??
    null;

  const teamId =
    (projectSettings?.linearTeamId as string) ??
    (workspaceSettings?.linearTeamId as string) ??
    process.env.LINEAR_TEAM_ID ??
    null;

  if (!apiKey || !teamId) return null;
  return { apiKey, teamId };
}

interface LinearGraphQLResponse {
  data?: {
    teams?: { nodes: Array<{ id: string; name: string }> };
    issueCreate?: {
      success: boolean;
      issue?: { id: string; url: string; identifier: string };
    };
    commentCreate?: {
      success: boolean;
      comment?: { id: string };
    };
  };
  errors?: Array<{ message: string }>;
}

async function linearGraphQL(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>
): Promise<LinearGraphQLResponse> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Linear API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<LinearGraphQLResponse>;
}

/**
 * Validate an API key against Linear and resolve the team issues will be filed in.
 * Uses `teamId` when given, otherwise the first team the key can see.
 */
export async function lookupLinearTeam(
  apiKey: string,
  teamId?: string
): Promise<{ teamId: string; teamName: string } | null> {
  const result = await linearGraphQL(apiKey, "query Teams { teams { nodes { id name } } }", {});
  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }
  const teams = result.data?.teams?.nodes ?? [];
  const team = teamId ? teams.find((t) => t.id === teamId) : teams[0];
  return team ? { teamId: team.id, teamName: team.name } : null;
}

export async function createBugIssue(
  bugReport: BugReport,
  projectId?: string
): Promise<LinearIssueResult> {
  const description = formatBugReportAsDescription(bugReport);
  const priority = SEVERITY_TO_PRIORITY[bugReport.severity] ?? 3;

  if (!projectId) {
    console.warn("[linear] No projectId provided, skipping issue creation");
    return {
      success: false,
      issueId: "",
      issueUrl: "",
      title: bugReport.title,
    };
  }

  const config = await getLinearConfig(projectId);
  if (!config) {
    console.warn(
      "[linear] No Linear API key or team ID configured, skipping issue creation"
    );
    return {
      success: false,
      issueId: "",
      issueUrl: "",
      title: bugReport.title,
    };
  }

  const query = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          url
          identifier
        }
      }
    }
  `;

  try {
    const result = await linearGraphQL(config.apiKey, query, {
      input: {
        teamId: config.teamId,
        title: `[Orbit] ${bugReport.title}`,
        description,
        priority,
        labelIds: [],
      },
    });

    if (result.errors?.length) {
      console.warn("[linear] GraphQL errors:", result.errors);
      return {
        success: false,
        issueId: "",
        issueUrl: "",
        title: bugReport.title,
      };
    }

    const issue = result.data?.issueCreate?.issue;
    if (!issue) {
      console.warn("[linear] No issue returned from mutation");
      return {
        success: false,
        issueId: "",
        issueUrl: "",
        title: bugReport.title,
      };
    }

    return {
      success: true,
      issueId: issue.id,
      issueUrl: issue.url,
      title: bugReport.title,
    };
  } catch (error) {
    console.warn("[linear] Issue creation request failed:", error);
    return {
      success: false,
      issueId: "",
      issueUrl: "",
      title: bugReport.title,
    };
  }
}

export async function postIssueComment(
  issueId: string,
  summary: RunSummary,
  projectId?: string
): Promise<LinearCommentResult> {
  const body = formatRunSummaryAsComment(summary);

  if (!projectId) {
    console.warn("[linear] No projectId provided, skipping comment");
    return { success: false, commentId: "", issueId };
  }

  const config = await getLinearConfig(projectId);
  if (!config) {
    console.warn(
      "[linear] No Linear API key configured, skipping comment"
    );
    return { success: false, commentId: "", issueId };
  }

  const query = `
    mutation CommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
        }
      }
    }
  `;

  try {
    const result = await linearGraphQL(config.apiKey, query, {
      input: {
        issueId,
        body,
      },
    });

    if (result.errors?.length) {
      console.warn("[linear] GraphQL errors:", result.errors);
      return { success: false, commentId: "", issueId };
    }

    const comment = result.data?.commentCreate?.comment;
    if (!comment) {
      console.warn("[linear] No comment returned from mutation");
      return { success: false, commentId: "", issueId };
    }

    return {
      success: true,
      commentId: comment.id,
      issueId,
    };
  } catch (error) {
    console.warn("[linear] Comment request failed:", error);
    return { success: false, commentId: "", issueId };
  }
}

export {
  formatBugReportAsDescription,
  formatRunSummaryAsComment,
};
export type { LinearIssueResult, LinearCommentResult };
