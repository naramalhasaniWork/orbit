import { Prisma } from "@/generated/prisma/client";
import { generateWebhookToken, hashWebhookToken, webhookTokenMatches } from "@/lib/integrations/inbound-token";
import { parseIntegrationSettings, type SettingsFor, type TypedProvider } from "@/server/domain/config";
import { defaultDb, withTransaction, type Db } from "./db";
import { jsonbMerge } from "./json-patch";
import { migrateWorkspaceIntegration } from "./legacy-migration";

/**
 * Inbound routing for Linear and Slack. Nothing here trusts an id the sender chose:
 * Linear posts to a per-connection URL carrying a token only Orbit and the admin know;
 * Slack commands (one app, one signing secret, one URL) route by a team id that was bound
 * through a signed `/orbit link <code>` and is held by exactly one connection.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

const connected = { status: "connected" as const, credentialsSealed: { not: Prisma.DbNull } };

export interface InboundConnection<P extends TypedProvider> {
  id: string;
  workspaceId: string;
  externalAccountId: string | null;
  settings: SettingsFor<P>;
}

/** Issue a new inbound token for a connected provider (the old one stops working). Null when not connected. */
export async function rotateInboundToken(
  workspaceId: string,
  provider: TypedProvider,
  db: Db = defaultDb
): Promise<{ connectionId: string; token: string } | null> {
  await migrateWorkspaceIntegration(workspaceId, provider, db);
  const fresh = generateWebhookToken();
  const { count } = await db.integrationConfig.updateMany({
    where: { workspaceId, provider, ...connected },
    data: { inboundTokenHash: fresh.hash },
  });
  if (count === 0) return null;
  const row = await db.integrationConfig.findUnique({
    where: { integration_config_unique: { workspaceId, provider } },
    select: { id: true },
  });
  return row ? { connectionId: row.id, token: fresh.token } : null;
}

/**
 * The connection a per-connection inbound URL names, only when it is connected and the
 * presented token matches its hash (constant time). Fails closed on every other path.
 */
export async function authenticateInbound<P extends TypedProvider>(
  connectionId: string,
  provider: P,
  presentedToken: string | null,
  db: Db = defaultDb
): Promise<InboundConnection<P> | null> {
  if (!UUID.test(connectionId)) return null;
  const row = await db.integrationConfig.findFirst({
    where: { id: connectionId, provider, ...connected },
    select: { id: true, workspaceId: true, externalAccountId: true, settings: true, inboundTokenHash: true },
  });
  if (!row || !webhookTokenMatches(presentedToken, row.inboundTokenHash)) return null;
  return { ...row, settings: parseIntegrationSettings(provider, row.settings) };
}

/** A one-time code for `/orbit link <code>`, valid for 15 minutes. Null when Slack is not connected. */
export async function createSlackLinkCode(
  workspaceId: string,
  db: Db = defaultDb
): Promise<{ code: string; expiresAt: string } | null> {
  const issued = await rotateInboundToken(workspaceId, "slack", db);
  if (!issued) return null;
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
  await patchSlackSettings(issued.connectionId, { linkCodeExpiresAt: expiresAt }, db);
  return { code: issued.token, expiresAt };
}

export type SlackLinkOutcome = "linked" | "pending" | "invalid";

/**
 * Bind the Slack team a signed request came from to the connection whose link code it
 * carries. If another connection already holds the team, the claim waits for an admin of
 * the claiming workspace to confirm (confirmSlackTeam); until then commands keep going to
 * the existing holder. The code is single-use either way.
 */
export async function claimSlackTeam(code: string, teamId: string, db: Db = defaultDb): Promise<SlackLinkOutcome> {
  if (!code || !teamId) return "invalid";
  const row = await db.integrationConfig.findFirst({
    where: { provider: "slack", inboundTokenHash: hashWebhookToken(code), ...connected },
    select: { id: true, settings: true },
  });
  if (!row) return "invalid";
  const { linkCodeExpiresAt } = parseIntegrationSettings("slack", row.settings);
  await db.integrationConfig.update({ where: { id: row.id }, data: { inboundTokenHash: null } });
  if (!linkCodeExpiresAt || Date.parse(linkCodeExpiresAt) < Date.now()) return "invalid";

  const holder = await db.integrationConfig.findFirst({
    where: { provider: "slack", externalAccountId: teamId, id: { not: row.id } },
    select: { id: true },
  });
  if (holder) {
    await patchSlackSettings(row.id, { pendingTeamId: teamId, linkCodeExpiresAt: null }, db);
    return "pending";
  }
  await db.integrationConfig.update({ where: { id: row.id }, data: { externalAccountId: teamId } });
  await patchSlackSettings(row.id, { pendingTeamId: null, linkCodeExpiresAt: null }, db);
  return "linked";
}

/** An admin of the claiming workspace moves the pending Slack team here, unbinding the previous holder. */
export async function confirmSlackTeam(workspaceId: string, db: Db = defaultDb): Promise<string | null> {
  const row = await db.integrationConfig.findUnique({
    where: { integration_config_unique: { workspaceId, provider: "slack" } },
    select: { id: true, status: true, settings: true },
  });
  const teamId = row?.status === "connected" ? parseIntegrationSettings("slack", row.settings).pendingTeamId : null;
  if (!row || !teamId) return null;

  await withTransaction(db, async (tx) => {
    await tx.integrationConfig.updateMany({
      where: { provider: "slack", externalAccountId: teamId, id: { not: row.id } },
      data: { externalAccountId: null },
    });
    await tx.integrationConfig.update({ where: { id: row.id }, data: { externalAccountId: teamId } });
    await patchSlackSettings(row.id, { pendingTeamId: null }, tx);
  });
  return teamId;
}

export type SlackTeamRoute = { workspaceId: string } | { unlinked: true } | { ambiguous: true };

/** The one connected Orbit workspace bound to this Slack team. More than one is refused, never guessed. */
export async function workspaceForSlackTeam(teamId: string, db: Db = defaultDb): Promise<SlackTeamRoute> {
  if (!teamId) return { unlinked: true };
  const rows = await db.integrationConfig.findMany({
    where: { provider: "slack", externalAccountId: teamId, status: "connected" },
    select: { workspaceId: true },
    take: 2,
  });
  if (rows.length === 0) return { unlinked: true };
  if (rows.length > 1) return { ambiguous: true };
  return { workspaceId: rows[0].workspaceId };
}

async function patchSlackSettings(id: string, patch: Record<string, unknown>, db: Db): Promise<void> {
  await db.$executeRaw`
    UPDATE "integration_configs" SET "settings" = ${jsonbMerge(patch)}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}::uuid`;
}
