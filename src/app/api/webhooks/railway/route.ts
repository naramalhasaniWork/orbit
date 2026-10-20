import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { launchPipelineRun, launchSummary } from "@/services/orchestrator/run-launcher";
import { updateEnvironmentUrl } from "@/services/integrations/railway/environment-sync";

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

interface RailwayWebhookPayload {
  type: string;
  timestamp: string;
  project?: { id: string; name: string };
  environment?: { id: string; name: string };
  service?: { id: string; name: string };
  deployment?: {
    id: string;
    status: string;
    url: string | null;
    staticUrl: string | null;
    meta?: {
      commitHash?: string;
      commitMessage?: string;
      branch?: string;
      repo?: string;
    };
  };
}

async function findProjectByRailwayId(
  railwayProjectId: string
): Promise<{ id: string; defaultBranch: string; workspaceId: string } | null> {
  const configs = await prisma.integrationConfig.findMany({
    where: { provider: "railway", isEnabled: true },
    select: { workspaceId: true, config: true },
  });

  for (const config of configs) {
    const cfg = config.config as { railwayProjectId?: string } | null;
    if (cfg?.railwayProjectId === railwayProjectId) {
      const project = await prisma.project.findFirst({
        where: { workspaceId: config.workspaceId, status: "active" },
        select: { id: true, defaultBranch: true, workspaceId: true },
        orderBy: { updatedAt: "desc" },
      });
      if (project) return project;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RAILWAY_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("x-railway-signature");

  // Fail closed: never accept an unverifiable webhook
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "RAILWAY_WEBHOOK_SECRET is not configured; webhook rejected" },
      { status: 503 }
    );
  }
  if (!verifySignature(body, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: RailwayWebhookPayload;
  try {
    payload = JSON.parse(body) as RailwayWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const railwayProjectId = payload.project?.id;
  if (!railwayProjectId) {
    return NextResponse.json({ status: "ignored", reason: "no_project" });
  }

  const project = await findProjectByRailwayId(railwayProjectId);
  if (!project) {
    return NextResponse.json({
      status: "ignored",
      reason: "no_matching_project",
    });
  }

  // Log the webhook event
  await prisma.webhookEvent.create({
    data: {
      projectId: project.id,
      provider: "railway",
      event: payload.type,
      externalId: payload.deployment?.id ?? null,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "received",
    },
  });

  const deployment = payload.deployment;
  const serviceId = payload.service?.id;
  const environmentId = payload.environment?.id;

  switch (payload.type) {
    case "DEPLOY_COMPLETED":
    case "deploy.completed": {
      // Update environment URL if domain changed
      if (serviceId && environmentId && deployment?.url) {
        const url = deployment.url.startsWith("http")
          ? deployment.url
          : `https://${deployment.url}`;
        await updateEnvironmentUrl(serviceId, environmentId, url);
      }

      // Trigger smoke test on successful deployment
      const branch =
        deployment?.meta?.branch ?? project.defaultBranch;

      const launched = await launchPipelineRun({
        projectId: project.id,
        mode: "smoke",
        trigger: "deploy",
        branch,
        commitSha: deployment?.meta?.commitHash ?? null,
        metadata: {
          railwayDeploymentId: deployment?.id ?? null,
          railwayServiceId: serviceId ?? null,
          railwayEnvironmentId: environmentId ?? null,
          commitMessage: deployment?.meta?.commitMessage ?? null,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json({
        status: "smoke_test_triggered",
        deploymentId: deployment?.id,
        ...launchSummary(launched),
      });
    }

    case "DEPLOY_FAILED":
    case "deploy.failed": {
      // Log the failure but don't trigger tests
      await prisma.webhookEvent.updateMany({
        where: {
          projectId: project.id,
          externalId: deployment?.id ?? "",
          provider: "railway",
        },
        data: {
          status: "processed",
          processedAt: new Date(),
        },
      });

      console.warn(
        `[railway] Deployment failed: ${deployment?.id} for project ${project.id}`
      );

      return NextResponse.json({
        status: "deploy_failure_logged",
        deploymentId: deployment?.id,
      });
    }

    case "DEPLOY_STARTED":
    case "deploy.started": {
      return NextResponse.json({
        status: "deploy_started_ack",
        deploymentId: deployment?.id,
      });
    }

    default:
      return NextResponse.json({ status: "ignored", type: payload.type });
  }
}
