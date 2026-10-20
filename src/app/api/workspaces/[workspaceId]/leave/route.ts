/**
 * POST /api/workspaces/:workspaceId/leave — Leave the workspace.
 * The owner must transfer ownership first.
 */

import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "workspace.view" },
  async ({ workspaceId, session, auth }) => {
    if (session.role === "owner") {
      const owners = await prisma.workspaceMember.count({
        where: { workspaceId, role: "owner" },
      });
      if (owners <= 1) {
        return apiError(
          "Transfer ownership to another member before leaving",
          "SOLE_OWNER",
          409
        );
      }
    }

    await prisma.workspaceMember.delete({ where: { id: auth.memberId } });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "member.left",
      resourceType: "workspace_member",
      resourceId: auth.memberId,
      metadata: { role: session.role },
    });

    return apiSuccess({ left: true });
  }
);
