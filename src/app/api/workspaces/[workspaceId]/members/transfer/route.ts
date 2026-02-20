import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";

// ============================================================
// POST /api/workspaces/[workspaceId]/members/transfer — Transfer ownership
// ============================================================

const TransferSchema = z.object({
  targetUserId: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "workspace.transfer");

    const body = await request.json();
    const parsed = TransferSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { targetUserId } = parsed.data;

    if (targetUserId === ctx.session.user.id) {
      return apiError("You are already the owner", "ALREADY_OWNER", 400);
    }

    // Verify target is a member
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspace_member_unique: {
          workspaceId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      return apiError("Target user is not a member", "NOT_FOUND", 404);
    }

    // Transfer in a transaction: demote current owner to admin, promote target to owner
    await prisma.$transaction([
      prisma.workspaceMember.update({
        where: {
          workspace_member_unique: {
            workspaceId,
            userId: ctx.session.user.id,
          },
        },
        data: { role: "admin" },
      }),
      prisma.workspaceMember.update({
        where: { id: targetMember.id },
        data: { role: "owner" },
      }),
    ]);

    await writeAuditLog({
      workspaceId,
      userId: ctx.session.user.id,
      action: "ownership.transferred",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: { previousOwner: ctx.session.user.id, newOwner: targetUserId },
    });

    return apiSuccess({ newOwner: targetUserId });
  } catch (error) {
    return handleApiError(error);
  }
}
