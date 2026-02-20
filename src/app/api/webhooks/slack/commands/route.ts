import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  findWorkspaceBySlackTeam,
  handleStatus,
  handleRun,
  handleResults,
  handleHealth,
} from "@/services/integrations/slack-commands";

function verifySlackSignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string
): boolean {
  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const expected =
    "v0=" + createHmac("sha256", signingSecret).update(baseString).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface SlackCommandPayload {
  text: string;
  team_id: string;
}

function parseCommandPayload(body: string): SlackCommandPayload {
  const params = new URLSearchParams(body);
  return {
    text: params.get("text") ?? "",
    team_id: params.get("team_id") ?? "",
  };
}

export async function POST(req: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  if (
    signingSecret &&
    !verifySlackSignature(body, timestamp, signature, signingSecret)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const command = parseCommandPayload(body);

  const workspace = await findWorkspaceBySlackTeam(command.team_id);
  if (!workspace) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "This Slack workspace is not connected to an Orbit workspace. Configure the integration in Orbit settings.",
    });
  }

  const subcommand = command.text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const args = command.text.trim().split(/\s+/).slice(1).join(" ");

  let response: Record<string, unknown>;

  switch (subcommand) {
    case "status":
      response = await handleStatus(workspace.id);
      break;

    case "run":
      if (!args) {
        response = { response_type: "ephemeral", text: "Usage: `/orbit run [project-name]`" };
      } else {
        response = await handleRun(workspace.id, args);
      }
      break;

    case "results":
      if (!args) {
        response = { response_type: "ephemeral", text: "Usage: `/orbit results [project-name]`" };
      } else {
        response = await handleResults(workspace.id, args);
      }
      break;

    case "health":
      response = await handleHealth(workspace.id);
      break;

    default:
      response = {
        response_type: "ephemeral",
        text: [
          "*Orbit Commands:*",
          "`/orbit status` — Show test health for all projects",
          "`/orbit run [project]` — Trigger a smoke test run",
          "`/orbit results [project]` — Show last run results",
          "`/orbit health` — Workspace health overview",
        ].join("\n"),
      };
      break;
  }

  return NextResponse.json(response);
}
