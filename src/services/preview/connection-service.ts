import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { connectionAccess, encryptCredentials, findConnection, generateWebhookToken, webhookPath } from "./connections";
import { getPreviewProvider } from "./registry";
import { closePreviewsForBindings } from "./coordinator";
import { PreviewProviderError, type PreviewProviderId, type PreviewTarget } from "./types";

export interface ConnectionSummary {
  id: string;
  provider: PreviewProviderId;
  label: string;
  status: string;
  lastError: string | null;
  accountId: string | null;
  /** Set for providers with webhooks; the full URL is origin + this path */
  webhookPath: string | null;
  hasWebhookToken: boolean;
  bindingCount: number;
}

interface ConnectInput {
  token: string;
  accountId?: string;
}

type ConnectionRow = Prisma.PreviewConnectionGetPayload<{ include: { _count: { select: { bindings: true } } } }>;

function summarize(row: ConnectionRow): ConnectionSummary {
  const provider = row.provider as PreviewProviderId;
  const config = (row.config ?? {}) as { accountId?: string };
  return {
    id: row.id,
    provider,
    label: row.label,
    status: row.status,
    lastError: row.lastError,
    accountId: config.accountId ?? null,
    webhookPath: getPreviewProvider(provider)?.parseEvent ? webhookPath(provider, row.id) : null,
    hasWebhookToken: !!row.webhookTokenHash,
    bindingCount: row._count.bindings,
  };
}

export async function getConnectionSummary(
  workspaceId: string,
  provider: PreviewProviderId
): Promise<ConnectionSummary | null> {
  const row = await prisma.previewConnection.findUnique({
    where: { preview_connection_unique: { workspaceId, provider, label: "default" } },
    include: { _count: { select: { bindings: true } } },
  });
  return row ? summarize(row) : null;
}

export async function listConnectionSummaries(workspaceId: string): Promise<ConnectionSummary[]> {
  const rows = await prisma.previewConnection.findMany({
    where: { workspaceId },
    include: { _count: { select: { bindings: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(summarize);
}

/**
 * Verify the credentials against the provider, then store them. A provider with webhooks gets
 * a webhook token on first connect; the plaintext is returned once and never stored.
 */
export async function connectProvider(
  workspaceId: string,
  provider: PreviewProviderId,
  input: ConnectInput
): Promise<{ connection: ConnectionSummary; webhookToken: string | null }> {
  const impl = getPreviewProvider(provider);
  if (!impl) throw new PreviewProviderError(`Unknown provider ${provider}`);

  const config: Record<string, string> = input.accountId ? { accountId: input.accountId } : {};
  await impl.verify({ token: input.token, config });

  const existing = await findConnection(workspaceId, provider);
  const fresh = impl.parseEvent && !existing?.webhookTokenHash ? generateWebhookToken() : null;

  const data = {
    credentials: encryptCredentials(input.token),
    config,
    status: "active",
    lastError: null,
    ...(fresh ? { webhookTokenHash: fresh.hash } : {}),
  };
  const row = await prisma.previewConnection.upsert({
    where: { preview_connection_unique: { workspaceId, provider, label: "default" } },
    create: { workspaceId, provider, label: "default", ...data },
    update: data,
    include: { _count: { select: { bindings: true } } },
  });
  return { connection: summarize(row), webhookToken: fresh?.token ?? null };
}

/** Issue a new webhook token; the old one stops working immediately. */
export async function rotateWebhookToken(workspaceId: string, provider: PreviewProviderId): Promise<string | null> {
  if (!getPreviewProvider(provider)?.parseEvent) return null;
  const existing = await findConnection(workspaceId, provider);
  if (!existing) return null;
  const fresh = generateWebhookToken();
  await prisma.previewConnection.update({ where: { id: existing.id }, data: { webhookTokenHash: fresh.hash } });
  return fresh.token;
}

/**
 * Deletes the connection row, which removes the encrypted token and the webhook token hash;
 * bindings and preview deployments cascade. Any legacy Railway IntegrationConfig row (the
 * token's old home, removed by migration 20261022) goes too, so no copy of the token survives.
 */
export async function disconnectProvider(workspaceId: string, provider: PreviewProviderId): Promise<boolean> {
  const bindings = await prisma.previewBinding.findMany({
    where: { connection: { workspaceId, provider } },
    select: { id: true, projectId: true },
  });
  await closePreviewsForBindings(bindings, "The preview provider was disconnected in Orbit");
  const [result] = await prisma.$transaction([
    prisma.previewConnection.deleteMany({ where: { workspaceId, provider } }),
    ...(provider === "railway"
      ? [prisma.integrationConfig.deleteMany({ where: { workspaceId, provider: "railway" } })]
      : []),
  ]);
  return result.count > 0;
}

export async function listProviderTargets(workspaceId: string, provider: PreviewProviderId): Promise<PreviewTarget[]> {
  const impl = getPreviewProvider(provider);
  const row = await findConnection(workspaceId, provider);
  const access = row && connectionAccess(row);
  if (!impl || !row || !access) throw new PreviewProviderError("This provider is not connected");
  try {
    return await impl.listTargets(access);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.previewConnection.update({ where: { id: row.id }, data: { status: "error", lastError: message } });
    throw err;
  }
}
