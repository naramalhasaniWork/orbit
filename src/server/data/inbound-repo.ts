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
const PENDING_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

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

export type SlackLinkResult =
  | { outcome: "invalid" }
  | { outcome: "linked"; workspaceId: string }
  | { outcome: "pending"; workspaceId: string; holderWorkspaceId: string };

/**
 * Bind the Slack team a signed request came from to the connection whose link code it
 * carries. If another connection already holds the team, nothing moves: the claim is
 * recorded (pendingTeamId, 24h) for an admin of the HOLDER workspace to approve or decline.
 * The code is single-use either way.
 */
export async function claimSlackTeam(code: string, teamId: string, db: Db = defaultDb): Promise<SlackLinkResult> {
  if (!code || !teamId) return { outcome: "invalid" };
  const row = await db.integrationConfig.findFirst({
    where: { provider: "slack", inboundTokenHash: hashWebhookToken(code), ...connected },
    select: { id: true, workspaceId: true, settings: true },
  });
  if (!row) return { outcome: "invalid" };
  const { linkCodeExpiresAt } = parseIntegrationSettings("slack", row.settings);
  await db.integrationConfig.update({ where: { id: row.id }, data: { inboundTokenHash: null } });
  if (!linkCodeExpiresAt || Date.parse(linkCodeExpiresAt) < Date.now()) return { outcome: "invalid" };

  const holder = await findHolder(teamId, row.id, db);
  if (holder) {
    await patchSlackSettings(row.id, { pendingTeamId: teamId, pendingTeamAt: new Date().toISOString(), linkCodeExpiresAt: null }, db);
    return { outcome: "pending", workspaceId: row.workspaceId, holderWorkspaceId: holder.workspaceId };
  }
  await db.integrationConfig.update({ where: { id: row.id }, data: { externalAccountId: teamId } });
  await patchSlackSettings(row.id, { pendingTeamId: null, pendingTeamAt: null, linkCodeExpiresAt: null }, db);
  return { outcome: "linked", workspaceId: row.workspaceId };
}

/** The live (under 24h) claim on a connection's settings, or null. */
function liveClaim(settings: unknown): { teamId: string; requestedAt: string } | null {
  const { pendingTeamId, pendingTeamAt } = parseIntegrationSettings("slack", settings);
  if (!pendingTeamId || !pendingTeamAt) return null;
  return Date.now() - Date.parse(pendingTeamAt) < PENDING_CLAIM_TTL_MS ? { teamId: pendingTeamId, requestedAt: pendingTeamAt } : null;
}

function findHolder(teamId: string, exceptId: string, db: Db) {
  return db.integrationConfig.findFirst({
    where: { provider: "slack", externalAccountId: teamId, id: { not: exceptId } },
    select: { id: true, workspaceId: true },
  });
}

async function slackRow(workspaceId: string, db: Db) {
  return db.integrationConfig.findUnique({
    where: { integration_config_unique: { workspaceId, provider: "slack" } },
    select: { id: true, status: true, externalAccountId: true, settings: true },
  });
}

/** This workspace's own live claim, if any (for its Slack card). */
export async function pendingSlackClaim(workspaceId: string, db: Db = defaultDb) {
  const row = await slackRow(workspaceId, db);
  return row?.status === "connected" ? liveClaim(row.settings) : null;
}

/** Live claims other workspaces have made on the Slack team this workspace holds (for the holder's card). */
export async function incomingSlackClaims(
  workspaceId: string,
  db: Db = defaultDb
): Promise<Array<{ workspaceId: string; workspaceName: string; requestedAt: string }>> {
  const row = await slackRow(workspaceId, db);
  if (!row?.externalAccountId) return [];
  const claims = await db.integrationConfig.findMany({
    where: {
      provider: "slack",
      status: "connected",
      id: { not: row.id },
      settings: { path: ["pendingTeamId"], equals: row.externalAccountId },
    },
    select: { workspaceId: true, settings: true, workspace: { select: { name: true } } },
  });
  return claims.flatMap((c) => {
    const claim = liveClaim(c.settings);
    return claim ? [{ workspaceId: c.workspaceId, workspaceName: c.workspace.name, requestedAt: claim.requestedAt }] : [];
  });
}

/**
 * The claiming workspace links a pending team itself, which works only once nobody holds
 * it (the holder disconnected or released it). It can never take the team from a holder.
 */
export async function completeSlackClaim(workspaceId: string, db: Db = defaultDb): Promise<"linked" | "held" | "none"> {
  const row = await slackRow(workspaceId, db);
  const claim = row?.status === "connected" ? liveClaim(row.settings) : null;
  if (!row || !claim) return "none";
  if (await findHolder(claim.teamId, row.id, db)) return "held";

  await db.integrationConfig.update({ where: { id: row.id }, data: { externalAccountId: claim.teamId } });
  await patchSlackSettings(row.id, { pendingTeamId: null, pendingTeamAt: null }, db);
  return "linked";
}

/**
 * An admin of the HOLDER workspace answers a live claim: approve moves the team to the
 * claimant (and unbinds it here), decline clears the claim. Returns the team id, or null
 * when there is no live claim from that workspace on the team held here.
 */
export async function answerSlackClaim(
  holderWorkspaceId: string,
  claimantWorkspaceId: string,
  approve: boolean,
  db: Db = defaultDb
): Promise<string | null> {
  const [holder, claimant] = await Promise.all([slackRow(holderWorkspaceId, db), slackRow(claimantWorkspaceId, db)]);
  const claim = claimant?.status === "connected" ? liveClaim(claimant.settings) : null;
  if (!holder?.externalAccountId || !claimant || !claim || claim.teamId !== holder.externalAccountId) return null;
  const teamId = claim.teamId;

  await withTransaction(db, async (tx) => {
    if (approve) {
      await tx.integrationConfig.update({ where: { id: holder.id }, data: { externalAccountId: null } });
      await tx.integrationConfig.update({ where: { id: claimant.id }, data: { externalAccountId: teamId } });
    }
    await patchSlackSettings(claimant.id, { pendingTeamId: null, pendingTeamAt: null }, tx);
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
