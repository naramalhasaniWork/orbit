import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { workspaceForSlackTeam } from "@/server/data/inbound-repo";

/**
 * Slack slash commands and interactions come from one Orbit Slack app, signed with its one
 * signing secret, at one URL each. The signature proves Slack sent the request and that
 * team_id is real; routing then needs that team bound to exactly one Orbit workspace
 * (bound only through a signed `/orbit link <code>`; see server/data/inbound-repo).
 */

const MAX_SKEW_SECONDS = 300;

export function verifySlackSignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string
): boolean {
  if (!timestamp || !signature) return false;
  // Replay protection: reject requests older than 5 minutes
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_SKEW_SECONDS) return false;

  const expected = "v0=" + createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The raw body when the request is signed by the Orbit Slack app, else the response to send. */
export async function verifiedSlackBody(req: Request): Promise<{ body: string } | NextResponse> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const body = await req.text();
  // Fail closed: never accept an unverifiable request
  if (!signingSecret) {
    return NextResponse.json({ error: "SLACK_SIGNING_SECRET is not configured; request rejected" }, { status: 503 });
  }
  const ok = verifySlackSignature(
    body,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
    signingSecret
  );
  return ok ? { body } : NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}

/** The Orbit workspace for a verified team id, or the ephemeral message explaining why there is none. */
export async function slackWorkspace(teamId: string): Promise<{ workspaceId: string } | { message: string }> {
  const route = await workspaceForSlackTeam(teamId);
  if ("workspaceId" in route) return route;
  if ("ambiguous" in route) {
    return {
      message:
        "This Slack workspace is linked to more than one Orbit workspace, so Orbit won't guess. An Orbit admin must confirm the link in Settings → Integrations → Slack.",
    };
  }
  return {
    message:
      "This Slack workspace is not linked to Orbit. In Orbit Settings → Integrations → Slack, get a link code and run `/orbit link <code>` here.",
  };
}
