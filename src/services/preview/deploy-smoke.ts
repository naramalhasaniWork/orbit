import { prisma } from "@/lib/db";
import type { IntegrationProvider, Prisma } from "@/generated/prisma/client";
import { launchPipelineRun, launchSummary } from "@/services/orchestrator/run-launcher";
import type { VerifiedDeploy } from "./types";

/**
 * A successful deploy of a long-lived (non-PR) environment triggers a smoke run on the bound
 * project's default environment, as the old Railway webhook did. Only deployments the provider
 * API confirmed reach here. Webhooks are delivered at least once, so each verified deployment
 * id is recorded and repeats are skipped.
 */
export async function launchDeploySmokeRuns(
  provider: IntegrationProvider,
  deploys: Array<VerifiedDeploy & { projectId: string }>
): Promise<Array<Record<string, string>>> {
  const results: Array<Record<string, string>> = [];
  for (const deploy of deploys) {
    const { projectId, deploymentId } = deploy;
    const seen = await prisma.webhookEvent.findFirst({
      where: { projectId, provider, externalId: deploymentId, status: "processed" },
      select: { id: true },
    });
    if (seen) continue;

    await prisma.webhookEvent.create({
      data: {
        projectId,
        provider,
        event: "deploy.verified",
        externalId: deploymentId,
        payload: { ...deploy } as unknown as Prisma.InputJsonValue,
        status: "processed",
        processedAt: new Date(),
      },
    });

    const launched = await launchPipelineRun({
      projectId,
      mode: "smoke",
      trigger: "deploy",
      branch: deploy.branch ?? undefined,
      commitSha: deploy.commitSha,
      metadata: { provider, deploymentId } as Prisma.InputJsonValue,
    });
    results.push({ projectId, ...launchSummary(launched) });
  }
  return results;
}
