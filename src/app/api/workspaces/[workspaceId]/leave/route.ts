/**
 * POST /api/workspaces/:workspaceId/leave — Leave the workspace.
 * The owner must transfer ownership first.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "workspace.view");

    if (ctx.role === "owner") {
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

    await prisma.workspaceMember.delete({ where: { id: ctx.memberId } });

    await writeAuditLog({
      workspaceId,
      userId: ctx.session.user.id,
      action: "member.left",
      resourceType: "workspace_member",
      resourceId: ctx.memberId,
      metadata: { role: ctx.role },
    });

    return apiSuccess({ left: true });
  } catch (error) {
    return handleApiError(error);
  }
}
