import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { authenticateInbound, type InboundConnection } from "@/server/data/inbound-repo";
import { launchPipelineRun, launchSummary } from "@/services/orchestrator/run-launcher";

const MAX_BODY_BYTES = 256 * 1024;

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    title?: string;
    state?: { name: string; type: string };
    labels?: Array<{ name: string }>;
    team?: { id: string; name: string };
    branchName?: string;
  };
  url?: string;
}

/**
 * The project inbound events run against: the one chosen in Settings, else the workspace's
 * only active project. Always inside the connection's workspace.
 */
async function targetProject(connection: InboundConnection<"linear">) {
  const { inboundProjectId } = connection.settings;
  const projects = await prisma.project.findMany({
    where: {
      workspaceId: connection.workspaceId,
      status: "active",
      ...(inboundProjectId ? { id: inboundProjectId } : {}),
    },
    select: { id: true, defaultBranch: true },
    take: 2,
  });
  return projects.length === 1 ? projects[0] : null;
}

/**
 * POST /api/webhooks/linear/:connectionId?token=… — Linear can't send custom headers, so
 * the per-connection token rides in the URL (X-Orbit-Token is accepted too). Unknown
 * connection, disconnected, or wrong token: 401. Events for a team other than the
 * connected one are ignored.
 */
export async function handleLinearWebhook(req: NextRequest, connectionId: string): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-orbit-token");
  const connection = await authenticateInbound(connectionId, "linear", token);
  if (!connection) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(body) as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, type, data } = payload;
  if (!data?.id) return NextResponse.json({ status: "ignored", reason: "no_data" });
  if (connection.externalAccountId && data.team?.id !== connection.externalAccountId) {
    return NextResponse.json({ status: "ignored", reason: "other_team" });
  }

  const project = await targetProject(connection);
  if (!project) {
    return NextResponse.json({ status: "ignored", reason: "no_target_project" });
  }

  await prisma.webhookDelivery.create({
    data: {
      projectId: project.id,
      event: `linear.${type}.${action}`,
      url: payload.url ?? "",
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });

  if (type !== "Issue" || action !== "update") {
    return NextResponse.json({ status: "ignored", action, type });
  }

  const branch = data.branchName ?? project.defaultBranch;
  const stateName = data.state?.name;

  // Issue moved to Done: regression run
  if (data.state?.type === "completed" || stateName === "Done") {
    const launched = await launchPipelineRun({
      projectId: project.id,
      mode: "regression",
      trigger: "linear",
      branch,
      metadata: { linearIssueId: data.id, linearIssueTitle: data.title ?? null, linearStateName: stateName ?? null },
    });
    return NextResponse.json({ status: "run_triggered", issueId: data.id, ...launchSummary(launched) });
  }

  // "Needs Testing" label: targeted run
  if (data.labels?.some((l) => l.name === "Needs Testing")) {
    const launched = await launchPipelineRun({
      projectId: project.id,
      mode: "targeted",
      trigger: "linear",
      branch,
      metadata: { linearIssueId: data.id, linearIssueTitle: data.title ?? null, linearLabel: "Needs Testing" },
    });
    return NextResponse.json({ status: "targeted_run_triggered", issueId: data.id, ...launchSummary(launched) });
  }

  return NextResponse.json({ status: "ignored", action, type });
}
