/**
 * POST /api/workspaces/:workspaceId/invitations/:invitationId/resend
 * Rotates the token (invalidating the old link), extends the expiry and re-sends the email.
 */

import { assertCanManageRole } from "@/lib/auth/rbac";
import { reissueInvitation } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { newInviteExpiry, newInviteToken } from "@/lib/invitations";
import { deliverInviteEmail } from "@/lib/email/invite-email";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "members.invite" },
  async ({ params: { invitationId }, workspaceId, session, db }) => {
    const invitation = await db.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId, status: { in: ["pending", "expired"] } },
    });
    if (!invitation) {
      return apiError("Invitation not found or already processed", "NOT_FOUND", 404);
    }

    // Same ceiling as creating an invite: you cannot re-issue an invite for a role at or above your own
    assertCanManageRole(session.role, invitation.role);

    // Re-read, seat check (lapsed invites only) and update all happen under the workspace lock
    const result = await reissueInvitation(db, invitation.id, {
      token: newInviteToken(),
      expiresAt: newInviteExpiry(),
    });
    if (!result.ok) {
      const { reason, code } = result.decision;
      return apiError(reason, code, code === "NOT_FOUND" ? 404 : 403);
    }
    const updated = result.invitation;

    const emailResult = await deliverInviteEmail(workspaceId, updated, session.user.name ?? null);

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "member.invited",
      resourceType: "workspace_invitation",
      resourceId: updated.id,
      metadata: { email: updated.email, role: updated.role, resent: true },
    });

    return apiSuccess({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      token: updated.token,
      expiresAt: updated.expiresAt,
      emailSent: emailResult.sent,
    });
  }
);
