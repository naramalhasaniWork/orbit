import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";
import { route } from "@/server/http/route";

// ============================================================
// POST /api/workspaces/[workspaceId]/members/transfer — Transfer ownership
// ============================================================

const TransferSchema = z.object({
  targetUserId: z.string().uuid(),
});

export const POST = route(
  { workspace: "param", permission: "workspace.transfer" },
  async ({ req: request, workspaceId, session }) => {
    const body = await request.json();
    const parsed = TransferSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { targetUserId } = parsed.data;

    if (targetUserId === session.user.id) {
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
            userId: session.user.id,
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
      userId: session.user.id,
      action: "ownership.transferred",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: { previousOwner: session.user.id, newOwner: targetUserId },
    });

    return apiSuccess({ newOwner: targetUserId });
  }
);
