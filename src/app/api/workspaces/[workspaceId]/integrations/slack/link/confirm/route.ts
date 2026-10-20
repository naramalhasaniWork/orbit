/**
 * POST /api/workspaces/:workspaceId/integrations/slack/link/confirm — link the Slack team this
 * workspace claimed, once no other workspace holds it. While a holder keeps it, only an admin
 * of the holder can hand it over (…/slack/claims/:claimantWorkspaceId).
 */

import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import { completeSlackClaim } from "@/server/data/inbound-repo";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session }) => {
    const outcome = await completeSlackClaim(workspaceId);
    if (outcome === "none") return apiError("No Slack link is waiting (claims lapse after 24 hours)", "NOT_FOUND", 404);
    if (outcome === "held") {
      return apiError(
        "Another Orbit workspace still holds this Slack team. Its admin must approve the move or disconnect Slack.",
        "TEAM_HELD",
        409
      );
    }

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", { action: "team_claim_completed" });
    return { linked: true };
  }
);
