import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getIndexingQueue } from "@/lib/queue/queues";
import { emitRunStarted } from "@/lib/websocket";

function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    title?: string;
    description?: string;
    state?: { name: string; type: string };
    labels?: Array<{ name: string }>;
    team?: { id: string; name: string };
    assignee?: { name: string; email: string };
    branchName?: string;
    project?: { id: string; name: string };
  };
  url?: string;
  organizationId?: string;
}

async function findProjectByLinearTeam(
  teamId: string
): Promise<{ id: string; defaultBranch: string } | null> {
  const projects = await prisma.project.findMany({
    where: { status: "active" },
    select: { id: true, defaultBranch: true, settings: true },
  });

  for (const project of projects) {
    const settings = project.settings as Record<string, unknown>;
    if (settings?.linearTeamId === teamId) {
      return { id: project.id, defaultBranch: project.defaultBranch };
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("linear-signature");

  // Verify HMAC if webhook secret is configured
  if (webhookSecret && !verifySignature(body, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(body) as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, type, data } = payload;

  // Find the project associated with this Linear team
  const teamId = data.team?.id;
  if (!teamId) {
    return NextResponse.json({ status: "ignored", reason: "no_team" });
  }

  const project = await findProjectByLinearTeam(teamId);
  if (!project) {
    return NextResponse.json({
      status: "ignored",
      reason: "no_matching_project",
    });
  }

  // Log the webhook delivery
  await prisma.webhookDelivery.create({
    data: {
      projectId: project.id,
      event: `linear.${type}.${action}`,
      url: payload.url ?? "",
      payload: payload as unknown as Record<string, string>,
    },
  });

  // Handle issue state changes
  if (type === "Issue" && action === "update") {
    const stateType = data.state?.type;
    const stateName = data.state?.name;

    // Trigger test run when issue moves to "Done"
    if (stateType === "completed" || stateName === "Done") {
      const branch = data.branchName ?? project.defaultBranch;

      const run = await prisma.testRun.create({
        data: {
          projectId: project.id,
          status: "queued",
          mode: "regression",
          trigger: "linear",
          branch,
          metadata: {
            linearIssueId: data.id,
            linearIssueTitle: data.title ?? null,
            linearStateName: stateName ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      const queue = getIndexingQueue();
      await queue.add(
        `index-${project.id}-linear`,
        {
          projectId: project.id,
          branch,
          isIncremental: true,
        },
        { jobId: `index-${project.id}-linear-${Date.now()}` }
      );

      await emitRunStarted(run.id, {
        runId: run.id,
        projectId: project.id,
        mode: "regression",
        trigger: "linear",
        totalTests: 0,
      });

      return NextResponse.json({
        status: "run_triggered",
        runId: run.id,
        issueId: data.id,
      });
    }

    // Handle "Needs Testing" label assignment to Orbit
    const hasTestingLabel = data.labels?.some(
      (l) => l.name === "Needs Testing"
    );
    if (hasTestingLabel) {
      const branch = data.branchName ?? project.defaultBranch;

      const run = await prisma.testRun.create({
        data: {
          projectId: project.id,
          status: "queued",
          mode: "targeted",
          trigger: "linear",
          branch,
          metadata: {
            linearIssueId: data.id,
            linearIssueTitle: data.title ?? null,
            linearLabel: "Needs Testing",
          } as Prisma.InputJsonValue,
        },
      });

      const queue = getIndexingQueue();
      await queue.add(
        `index-${project.id}-linear-test`,
        {
          projectId: project.id,
          branch,
          isIncremental: false,
        },
        { jobId: `index-${project.id}-linear-test-${Date.now()}` }
      );

      await emitRunStarted(run.id, {
        runId: run.id,
        projectId: project.id,
        mode: "targeted",
        trigger: "linear",
        totalTests: 0,
      });

      return NextResponse.json({
        status: "targeted_run_triggered",
        runId: run.id,
        issueId: data.id,
      });
    }
  }

  return NextResponse.json({ status: "ignored", action, type });
}
