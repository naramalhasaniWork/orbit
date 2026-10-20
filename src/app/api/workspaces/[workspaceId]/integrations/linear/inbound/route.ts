/**
 * POST /api/workspaces/:workspaceId/integrations/linear/inbound — issue (or replace) this
 * workspace's inbound Linear webhook URL. The token in it is returned once; Orbit keeps a hash.
 */

import { auditSettingsChange } from "@/lib/auth/audit";
import { apiError } from "@/lib/utils/api";
import { requestOrigin } from "@/lib/setup/access";
import { rotateInboundToken } from "@/server/data/inbound-repo";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req, workspaceId, session }) => {
    const issued = await rotateInboundToken(workspaceId, "linear");
    if (!issued) return apiError("Linear is not connected", "NOT_CONNECTED", 409);

    await auditSettingsChange(session.user.id, workspaceId, "integration.linear", { action: "inbound_token_rotated" });

    const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? requestOrigin(req.headers);
    const webhookUrl = `${origin}/api/webhooks/linear/${issued.connectionId}?token=${encodeURIComponent(issued.token)}`;
    return { webhookUrl };
  }
);
