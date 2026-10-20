import { NextRequest, NextResponse } from "next/server";
import { claimSlackTeam } from "@/server/data/inbound-repo";
import { slackWorkspace, verifiedSlackBody } from "@/services/integrations/slack-inbound";
import {
  handleStatus,
  handleRun,
  handleResults,
  handleHealth,
} from "@/services/integrations/slack-commands";

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

const LINK_REPLIES = {
  linked: "Linked: `/orbit` commands from this Slack workspace now act on your Orbit workspace.",
  pending:
    "This Slack workspace is already linked to another Orbit workspace. An admin of the Orbit workspace that issued this code must confirm the move in Settings → Integrations → Slack.",
  invalid: "That link code is invalid or expired. Get a new one in Orbit Settings → Integrations → Slack.",
} as const;

export async function POST(req: NextRequest) {
  const verified = await verifiedSlackBody(req);
  if (verified instanceof NextResponse) return verified;

  const command = parseCommandPayload(verified.body);
  const [subcommand = "", ...rest] = command.text.trim().split(/\s+/);

  // Binding: only a signed request carrying a code issued to an Orbit admin can claim a team
  if (subcommand.toLowerCase() === "link") {
    const outcome = await claimSlackTeam(rest[0] ?? "", command.team_id);
    return NextResponse.json({ response_type: "ephemeral", text: LINK_REPLIES[outcome] });
  }

  const workspace = await slackWorkspace(command.team_id);
  if ("message" in workspace) {
    return NextResponse.json({ response_type: "ephemeral", text: workspace.message });
  }
  const workspaceId = workspace.workspaceId;

  const args = rest.join(" ");

  let response: Record<string, unknown>;

  switch (subcommand.toLowerCase()) {
    case "status":
      response = await handleStatus(workspaceId);
      break;

    case "run":
      if (!args) {
        response = { response_type: "ephemeral", text: "Usage: `/orbit run [project-name]`" };
      } else {
        response = await handleRun(workspaceId, args);
      }
      break;

    case "results":
      if (!args) {
        response = { response_type: "ephemeral", text: "Usage: `/orbit results [project-name]`" };
      } else {
        response = await handleResults(workspaceId, args);
      }
      break;

    case "health":
      response = await handleHealth(workspaceId);
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
          "`/orbit link [code]` — Link this Slack workspace to Orbit",
        ].join("\n"),
      };
      break;
  }

  return NextResponse.json(response);
}
