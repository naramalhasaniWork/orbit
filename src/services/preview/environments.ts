import { prisma } from "@/lib/db";

/** Environment.source for environments the preview coordinator creates. */
export const PREVIEW_ENV_SOURCE = "preview";

export const ACCESS_MODES = {
  public: "public",
  cloudflareAccess: "cloudflare_access",
} as const;

interface PreviewEnvironmentInput {
  projectId: string;
  bindingId: string;
  prNumber: number;
  url: string;
  accessMode: string;
}

/**
 * One Environment per PR: each new commit's preview re-points it, so run history for a PR
 * stays on one environment. Un-archives it when the PR is reopened.
 */
export async function upsertPreviewEnvironment(input: PreviewEnvironmentInput): Promise<string> {
  const sourceId = `${input.bindingId}:${input.prNumber}`;
  const existing = await prisma.environment.findFirst({
    where: { projectId: input.projectId, source: PREVIEW_ENV_SOURCE, sourceId },
    select: { id: true },
  });
  const data = { url: input.url, accessMode: input.accessMode, archivedAt: null };
  if (existing) {
    await prisma.environment.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.environment.create({
    data: {
      ...data,
      projectId: input.projectId,
      name: `PR #${input.prNumber} preview`,
      type: "preview",
      defaultRunMode: "smoke",
      source: PREVIEW_ENV_SOURCE,
      sourceId,
    },
    select: { id: true },
  });
  return created.id;
}

export async function archivePreviewEnvironments(projectId: string, prNumber: number): Promise<void> {
  await prisma.environment.updateMany({
    where: { projectId, source: PREVIEW_ENV_SOURCE, sourceId: { endsWith: `:${prNumber}` }, archivedAt: null },
    data: { archivedAt: new Date() },
  });
}
