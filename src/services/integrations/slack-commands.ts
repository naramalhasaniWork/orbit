import { prisma } from "@/lib/db";
import { getIndexingQueue } from "@/lib/queue/queues";
import { emitRunStarted } from "@/lib/websocket";

type SlackResponse = Record<string, unknown>;

export async function findWorkspaceBySlackTeam(
  teamId: string
): Promise<{ id: string } | null> {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, settings: true },
  });

  for (const ws of workspaces) {
    const settings = ws.settings as Record<string, unknown>;
    if (settings?.slackTeamId === teamId) {
      return { id: ws.id };
    }
  }

  return null;
}

export async function handleStatus(workspaceId: string): Promise<SlackResponse> {
  const projects = await prisma.project.findMany({
    where: { workspaceId, status: "active" },
    select: { name: true, healthStatus: true, lastRunAt: true },
  });

  const projectLines = projects.map((p) => {
    const icon =
      p.healthStatus === "healthy"
        ? ":white_check_mark:"
        : p.healthStatus === "degraded"
          ? ":warning:"
          : ":x:";
    const lastRun = p.lastRunAt
      ? `Last run: ${p.lastRunAt.toISOString().split("T")[0]}`
      : "No runs yet";
    return `${icon} *${p.name}* — ${lastRun}`;
  });

  return {
    response_type: "in_channel",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Orbit Test Health", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: projectLines.length > 0 ? projectLines.join("\n") : "No active projects found.",
        },
      },
    ],
  };
}

export async function handleRun(
  workspaceId: string,
  projectName: string
): Promise<SlackResponse> {
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      status: "active",
      name: { contains: projectName, mode: "insensitive" },
    },
    select: { id: true, name: true, defaultBranch: true },
  });

  if (!project) {
    return {
      response_type: "ephemeral",
      text: `Project "${projectName}" not found. Use \`/orbit status\` to see available projects.`,
    };
  }

  const run = await prisma.testRun.create({
    data: {
      projectId: project.id,
      status: "queued",
      mode: "smoke",
      trigger: "manual",
      branch: project.defaultBranch,
    },
  });

  const queue = getIndexingQueue();
  await queue.add(
    `index-${project.id}-slack`,
    {
      projectId: project.id,
      branch: project.defaultBranch,
      isIncremental: true,
    },
    { jobId: `index-${project.id}-slack-${Date.now()}` }
  );

  await emitRunStarted(run.id, {
    runId: run.id,
    projectId: project.id,
    mode: "smoke",
    trigger: "manual",
    totalTests: 0,
  });

  return {
    response_type: "in_channel",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:rocket: Smoke test run started for *${project.name}*\nRun ID: \`${run.id}\``,
        },
      },
    ],
  };
}

export async function handleResults(
  workspaceId: string,
  projectName: string
): Promise<SlackResponse> {
  const project = await prisma.project.findFirst({
    where: {
      workspaceId,
      status: "active",
      name: { contains: projectName, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  if (!project) {
    return {
      response_type: "ephemeral",
      text: `Project "${projectName}" not found. Use \`/orbit status\` to see available projects.`,
    };
  }

  const lastRun = await prisma.testRun.findFirst({
    where: { projectId: project.id, status: "completed" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      totalTests: true,
      passed: true,
      failed: true,
      flaky: true,
      durationMs: true,
      summary: true,
    },
  });

  if (!lastRun) {
    return {
      response_type: "ephemeral",
      text: `No completed runs found for *${project.name}*.`,
    };
  }

  const passRate =
    lastRun.totalTests > 0
      ? ((lastRun.passed / lastRun.totalTests) * 100).toFixed(1)
      : "0.0";
  const duration = lastRun.durationMs
    ? `${(lastRun.durationMs / 1000).toFixed(1)}s`
    : "N/A";
  const statusIcon = lastRun.failed > 0 ? ":x:" : ":white_check_mark:";

  return {
    response_type: "in_channel",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${statusIcon} ${project.name} — Last Run`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total:*\n${lastRun.totalTests}` },
          { type: "mrkdwn", text: `*Pass Rate:*\n${passRate}%` },
          { type: "mrkdwn", text: `*Passed:*\n${lastRun.passed}` },
          { type: "mrkdwn", text: `*Failed:*\n${lastRun.failed}` },
          { type: "mrkdwn", text: `*Flaky:*\n${lastRun.flaky}` },
          { type: "mrkdwn", text: `*Duration:*\n${duration}` },
        ],
      },
      ...(lastRun.summary
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `> ${lastRun.summary}` },
            },
          ]
        : []),
    ],
  };
}

export async function handleHealth(workspaceId: string): Promise<SlackResponse> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { creditBalance: true, monthlyCredits: true },
  });

  const projects = await prisma.project.findMany({
    where: { workspaceId, status: "active" },
    select: { healthStatus: true },
  });

  const healthy = projects.filter((p) => p.healthStatus === "healthy").length;
  const degraded = projects.filter((p) => p.healthStatus === "degraded").length;
  const failing = projects.filter((p) => p.healthStatus === "failing").length;

  const activeRuns = await prisma.testRun.count({
    where: {
      project: { workspaceId },
      status: { in: ["queued", "indexing", "planning", "executing", "reporting"] },
    },
  });

  return {
    response_type: "in_channel",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Orbit Workspace Health", emoji: true },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Projects:*\n:white_check_mark: ${healthy} healthy | :warning: ${degraded} degraded | :x: ${failing} failing`,
          },
          { type: "mrkdwn", text: `*Active Runs:*\n${activeRuns}` },
          {
            type: "mrkdwn",
            text: `*Credits:*\n${workspace?.creditBalance ?? 0} / ${workspace?.monthlyCredits ?? 0}`,
          },
        ],
      },
    ],
  };
}
