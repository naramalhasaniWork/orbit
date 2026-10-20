/**
 * POST /api/workspaces/:workspaceId/integrations/slack/claims/:claimantWorkspaceId — an admin
 * of the workspace holding a Slack team approves (moves the team there) or declines another
 * workspace's claim on it. Both workspaces get an audit entry.
 */

import { z } from "zod";
import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import { answerSlackClaim } from "@/server/data/inbound-repo";
import { route } from "@/server/http/route";

const params = z.object({ workspaceId: z.string().uuid(), claimantWorkspaceId: z.string().uuid() });
const body = z.object({ approve: z.boolean() });

export const POST = route(
  { workspace: "param", permission: "settings.manage", params, body },
  async ({ params: { claimantWorkspaceId }, body: { approve }, workspaceId, session }) => {
    const teamId = await answerSlackClaim(workspaceId, claimantWorkspaceId, approve);
    if (!teamId) return apiError("No live claim from that workspace on your Slack team", "NOT_FOUND", 404);

    const action = approve ? "team_transfer_approved" : "team_transfer_declined";
    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", { action, teamId, claimantWorkspaceId });
    await auditSettingsChange(undefined, claimantWorkspaceId, "integration.slack", {
      action, teamId, holderWorkspaceId: workspaceId, approvedBy: session.user.id,
    });
    return { teamId, moved: approve };
  }
);
