/**
 * POST /api/workspaces/:workspaceId/integrations/slack/link/confirm — move a Slack team that
 * linked here while another Orbit workspace held it. The other workspace loses the binding.
 */

import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import { confirmSlackTeam } from "@/server/data/inbound-repo";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session }) => {
    const teamId = await confirmSlackTeam(workspaceId);
    if (!teamId) return apiError("No Slack link is waiting for confirmation", "NOT_FOUND", 404);

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", { action: "team_link_confirmed", teamId });
    return { teamId };
  }
);
