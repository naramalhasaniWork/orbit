import { prisma } from "@/lib/db";
import type { IntegrationProvider, Prisma } from "@/generated/prisma/client";
import { launchPipelineRun, launchSummary } from "@/services/orchestrator/run-launcher";
import type { PreviewHint } from "./types";

/**
 * A successful deploy of a long-lived (non-PR) environment triggers a smoke run on each bound
 * project's default environment, as the old Railway webhook did. Provider webhooks are
 * delivered at least once, so the deployment id is recorded and repeats are skipped.
 */
export async function launchDeploySmokeRuns(
  provider: IntegrationProvider,
  bindings: Array<{ projectId: string }>,
  hint: PreviewHint
): Promise<Array<Record<string, string>>> {
  if (hint.isPreview || !hint.succeeded || !hint.externalId) return [];

  const results: Array<Record<string, string>> = [];
  for (const { projectId } of bindings) {
    const seen = await prisma.webhookEvent.findFirst({
      where: { projectId, provider, externalId: hint.externalId, status: "processed" },
      select: { id: true },
    });
    if (seen) continue;

    await prisma.webhookEvent.create({
      data: {
        projectId,
        provider,
        event: hint.event,
        externalId: hint.externalId,
        payload: { ...hint } as unknown as Prisma.InputJsonValue,
        status: "processed",
        processedAt: new Date(),
      },
    });

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { defaultBranch: true } });
    const launched = await launchPipelineRun({
      projectId,
      mode: "smoke",
      trigger: "deploy",
      branch: hint.branch ?? project?.defaultBranch ?? "main",
      commitSha: hint.commitSha,
      metadata: { provider, deploymentId: hint.externalId, ...hint.refs } as Prisma.InputJsonValue,
    });
    results.push({ projectId, ...launchSummary(launched) });
  }
  return results;
}
