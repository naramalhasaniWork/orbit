import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { resolveGitHubToken, getRepoInfo } from "@/lib/github/token";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";

const ORBIT_MENTION_PATTERN = /@orbit(?:-testing)?(?:\[bot\])?\s*/i;

interface MentionCommand {
  action: "run" | "review" | "status" | "help" | "unknown";
  args: string;
}

interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  branch: string;
  commitSha: string;
  commentId: number;
  commentBody: string;
  commentAuthor: string;
}

function parseCommand(body: string): MentionCommand | null {
  const match = body.match(ORBIT_MENTION_PATTERN);
  if (!match) return null;

  const afterMention = body.slice((match.index ?? 0) + match[0].length).trim();
  const firstLine = afterMention.split("\n")[0].trim().toLowerCase();

  if (!firstLine || firstLine === "help") {
    return { action: "help", args: "" };
  }

  if (firstLine.startsWith("run") || firstLine.startsWith("test")) {
    return { action: "run", args: afterMention };
  }

  if (firstLine.startsWith("review") || firstLine.startsWith("check")) {
    return { action: "review", args: afterMention };
  }

  if (firstLine.startsWith("status")) {
    return { action: "status", args: afterMention };
  }

  return { action: "run", args: afterMention };
}

async function postReply(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string
): Promise<boolean> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      console.warn(`[mention] Reply failed (${res.status}):`, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.warn("[mention] Reply request failed:", err);
    return false;
  }
}

async function addReaction(
  owner: string,
  repo: string,
  commentId: number,
  reaction: string,
  token: string
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: reaction }),
    });
  } catch {
    // Non-critical, ignore
  }
}

function buildHelpMessage(): string {
  return [
    "### Orbit Commands\n",
    "| Command | Description |",
    "|---------|------------|",
    "| `@orbit run` | Run tests against this PR |",
    "| `@orbit review` | Analyze PR changes and suggest test scenarios |",
    "| `@orbit status` | Show latest test run status for this PR |",
    "| `@orbit help` | Show this help message |",
    "",
    "> Orbit will automatically run tests on new PRs if webhooks are configured.",
    "",
    "---",
    "*Powered by [Orbit](https://orbitesting.com)*",
  ].join("\n");
}

async function handleRunCommand(
  ctx: PRContext,
  projectId: string,
  token: string
): Promise<void> {
  await addReaction(ctx.owner, ctx.repo, ctx.commentId, "rocket", token);

  const launched = await launchPipelineRun({
    projectId,
    mode: "targeted",
    trigger: "pr",
    branch: ctx.branch,
    commitSha: ctx.commitSha,
    prNumber: ctx.prNumber,
    metadata: {
      triggeredBy: ctx.commentAuthor,
      triggerSource: "mention",
    } as Prisma.InputJsonValue,
  });

  if (!launched.ok) {
    await postReply(
      ctx.owner, ctx.repo, ctx.prNumber,
      `**Orbit** could not start a run: ${launched.reason}`,
      token
    );
    return;
  }

  await postReply(
    ctx.owner,
    ctx.repo,
    ctx.prNumber,
    [
      `**Orbit** is running tests on \`${ctx.branch}\` (triggered by @${ctx.commentAuthor})`,
      "",
      `Run ID: \`${launched.runId.slice(0, 8)}\``,
      "",
      "I'll post the results here when the run completes.",
    ].join("\n"),
    token
  );
}

async function handleStatusCommand(
  ctx: PRContext,
  projectId: string,
  token: string
): Promise<void> {
  const latestRun = await prisma.testRun.findFirst({
    where: { projectId, prNumber: ctx.prNumber },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      mode: true,
      createdAt: true,
      completedAt: true,
      results: {
        select: { verdict: true },
      },
    },
  });

  if (!latestRun) {
    await postReply(
      ctx.owner,
      ctx.repo,
      ctx.prNumber,
      "No test runs found for this PR. Use `@orbit run` to trigger one.",
      token
    );
    return;
  }

  const passed = latestRun.results.filter((r) => r.verdict === "pass").length;
  const failed = latestRun.results.filter((r) => r.verdict === "fail").length;
  const total = latestRun.results.length;
  const statusEmoji = latestRun.status === "completed"
    ? (failed > 0 ? ":x:" : ":white_check_mark:")
    : ":hourglass_flowing_sand:";

  await postReply(
    ctx.owner,
    ctx.repo,
    ctx.prNumber,
    [
      `### ${statusEmoji} Orbit Test Status`,
      "",
      `| Field | Value |`,
      `|-------|-------|`,
      `| Status | \`${latestRun.status}\` |`,
      `| Mode | \`${latestRun.mode}\` |`,
      `| Tests | ${total} total, ${passed} passed, ${failed} failed |`,
      `| Started | ${latestRun.createdAt.toISOString()} |`,
      latestRun.completedAt ? `| Completed | ${latestRun.completedAt.toISOString()} |` : "",
      "",
      "---",
      "*Powered by [Orbit](https://orbitesting.com)*",
    ].filter(Boolean).join("\n"),
    token
  );
}

async function handleReviewCommand(
  ctx: PRContext,
  projectId: string,
  token: string
): Promise<void> {
  await addReaction(ctx.owner, ctx.repo, ctx.commentId, "eyes", token);

  await postReply(
    ctx.owner,
    ctx.repo,
    ctx.prNumber,
    [
      `**Orbit** is reviewing the changes on \`${ctx.branch}\`...`,
      "",
      "I'll analyze the diff and suggest test scenarios shortly.",
    ].join("\n"),
    token
  );

  // Trigger a targeted run in review mode
  const launched = await launchPipelineRun({
    projectId,
    mode: "targeted",
    trigger: "pr",
    branch: ctx.branch,
    commitSha: ctx.commitSha,
    prNumber: ctx.prNumber,
    metadata: {
      triggeredBy: ctx.commentAuthor,
      triggerSource: "mention",
      reviewMode: true,
    } as Prisma.InputJsonValue,
  });
  if (!launched.ok) {
    console.warn(`[mention] Review run not started for PR #${ctx.prNumber}: ${launched.reason}`);
  }
}

export async function handleMention(
  repoUrl: string,
  ctx: PRContext
): Promise<void> {
  const command = parseCommand(ctx.commentBody);
  if (!command) return;

  const project = await prisma.project.findFirst({
    where: { repoUrl },
  });

  if (!project) {
    console.warn(`[mention] No project found for repo: ${repoUrl}`);
    return;
  }

  const resolved = await resolveGitHubToken(project.id);
  if (!resolved) {
    console.warn(`[mention] No token available for project: ${project.id}`);
    return;
  }

  const { token } = resolved;

  switch (command.action) {
    case "run":
      await handleRunCommand(ctx, project.id, token);
      break;

    case "status":
      await handleStatusCommand(ctx, project.id, token);
      break;

    case "review":
      await handleReviewCommand(ctx, project.id, token);
      break;

    case "help":
      await postReply(ctx.owner, ctx.repo, ctx.prNumber, buildHelpMessage(), token);
      break;

    default:
      await postReply(
        ctx.owner,
        ctx.repo,
        ctx.prNumber,
        `I didn't understand that command. Try \`@orbit help\` to see what I can do.`,
        token
      );
  }
}

export { ORBIT_MENTION_PATTERN, parseCommand };
export type { MentionCommand, PRContext };
