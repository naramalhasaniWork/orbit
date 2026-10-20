import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/vault";
import { ACCESS_SECRET_KEYS, ACCESS_SECRET_PREFIX } from "@/services/execution/access-headers";
import { providerInfo } from "./catalog";
import { listProviderTargets } from "./connection-service";
import { closePreviewsForBindings } from "./coordinator";
import { normalizeHostSuffix } from "./url-policy";
import { PreviewProviderError, type PreviewProviderId } from "./types";

export interface SaveBindingInput {
  provider: PreviewProviderId;
  targetRef: string;
  allowedHostSuffixes?: string[];
  /** Set to store a Cloudflare Access service token; null removes it; omitted keeps it */
  access?: { clientId: string; clientSecret: string } | null;
}

export async function getBindingView(projectId: string) {
  const [binding, deployments] = await Promise.all([
    prisma.previewBinding.findUnique({
      where: { projectId },
      include: { connection: { select: { id: true, provider: true, status: true } } },
    }),
    prisma.previewDeployment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, commitSha: true, branch: true, prNumber: true, url: true, status: true,
        error: true, runId: true, createdAt: true, readyAt: true,
      },
    }),
  ]);
  return { binding, deployments };
}

/**
 * Bind a project to a provider target. The target must be one the workspace's connection can
 * see, so a binding can never point at another account's project.
 */
export async function saveBinding(workspaceId: string, projectId: string, input: SaveBindingInput) {
  const info = providerInfo(input.provider);
  const connection = await prisma.previewConnection.findUnique({
    where: { preview_connection_unique: { workspaceId, provider: input.provider, label: "default" } },
    select: { id: true },
  });
  if (!info || !connection) throw new PreviewProviderError(`Connect ${info?.name ?? input.provider} first`);

  const targets = await listProviderTargets(workspaceId, input.provider);
  const target = targets.find((t) => t.ref === input.targetRef);
  if (!target) throw new PreviewProviderError(`That ${info.targetNoun} is not visible to the connected token`);

  const suffixes = (input.allowedHostSuffixes?.length ? input.allowedHostSuffixes : info.defaultHostSuffixes)
    .map(normalizeHostSuffix);
  if (suffixes.some((s) => s === null)) {
    throw new PreviewProviderError("Allowed hosts must be domain suffixes like up.railway.app");
  }

  if (input.access) await storeAccessSecrets(projectId, input.access);
  if (input.access === null) await removeAccessSecrets(projectId);
  const accessSecretPrefix =
    input.access === undefined ? undefined : input.access ? ACCESS_SECRET_PREFIX : null;

  const data = {
    connectionId: connection.id,
    targetRef: target.ref,
    targetLabel: target.label,
    allowedHostSuffixes: suffixes as string[],
    ...(accessSecretPrefix !== undefined ? { accessSecretPrefix } : {}),
  };
  return prisma.previewBinding.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
}

export async function deleteBinding(projectId: string): Promise<void> {
  const binding = await prisma.previewBinding.findUnique({ where: { projectId }, select: { id: true, projectId: true } });
  if (!binding) return;
  await closePreviewsForBindings([binding], "This project's preview source was removed in Orbit");
  await prisma.previewBinding.deleteMany({ where: { projectId } });
}

async function storeAccessSecrets(projectId: string, access: { clientId: string; clientSecret: string }) {
  const values = { [ACCESS_SECRET_KEYS.clientId]: access.clientId, [ACCESS_SECRET_KEYS.clientSecret]: access.clientSecret };
  for (const [key, value] of Object.entries(values)) {
    const { encrypted, iv } = encrypt(value);
    const existing = await prisma.secret.findFirst({ where: { projectId, key, environmentId: null }, select: { id: true } });
    if (existing) {
      await prisma.secret.update({ where: { id: existing.id }, data: { encryptedValue: encrypted, iv } });
    } else {
      await prisma.secret.create({ data: { projectId, key, encryptedValue: encrypted, iv } });
    }
  }
}

async function removeAccessSecrets(projectId: string) {
  await prisma.secret.deleteMany({
    where: { projectId, environmentId: null, key: { in: Object.values(ACCESS_SECRET_KEYS) } },
  });
}

/** The stored Access token for a project, for "Test access" when the form leaves it blank. */
export async function loadAccessSecrets(projectId: string): Promise<{ clientId: string; clientSecret: string } | null> {
  const rows = await prisma.secret.findMany({
    where: { projectId, environmentId: null, key: { in: Object.values(ACCESS_SECRET_KEYS) } },
  });
  const value = (key: string) => {
    const row = rows.find((r) => r.key === key);
    return row ? decrypt(row.encryptedValue, row.iv) : null;
  };
  const clientId = value(ACCESS_SECRET_KEYS.clientId);
  const clientSecret = value(ACCESS_SECRET_KEYS.clientSecret);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
