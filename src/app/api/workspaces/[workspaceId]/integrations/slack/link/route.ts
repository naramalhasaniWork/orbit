/**
 * POST /api/workspaces/:workspaceId/integrations/slack/link — a one-time code an admin runs
 * as `/orbit link <code>` in Slack, binding that Slack team to this workspace's commands.
 */

import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import { createSlackLinkCode } from "@/server/data/inbound-repo";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, session }) => {
    const link = await createSlackLinkCode(workspaceId);
    if (!link) return apiError("Slack is not connected", "NOT_CONNECTED", 409);

    await auditSettingsChange(session.user.id, workspaceId, "integration.slack", { action: "link_code_issued" });
    return { command: `/orbit link ${link.code}`, expiresAt: link.expiresAt };
  }
);
