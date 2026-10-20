import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";

// ============================================================
// POST /api/invitations/[token]/accept — Accept a workspace invitation
// ============================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await requireAuth();
    const { token } = await params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { id: true, name: true, slug: true, deletedAt: true } },
      },
    });

    if (!invitation || invitation.workspace.deletedAt) {
      return apiError("Invitation not found", "NOT_FOUND", 404);
    }

    if (invitation.status !== "pending") {
      return apiError(
        `Invitation has already been ${invitation.status}`,
        "INVITATION_INVALID",
        410
      );
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      return apiError("Invitation has expired", "INVITATION_EXPIRED", 410);
    }

    // Verify the email matches
    if (session.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return apiError(
        "This invitation was sent to a different email address",
        "EMAIL_MISMATCH",
        403
      );
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspace_member_unique: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
        },
      },
    });

    if (existingMember) {
      // Mark invitation as accepted even though they're already a member
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
      return apiSuccess({
        workspaceId: invitation.workspaceId,
        workspace: invitation.workspace,
        alreadyMember: true,
      });
    }

    // Create membership and mark invitation accepted in a transaction
    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
      }),
    ]);

    await writeAuditLog({
      workspaceId: invitation.workspaceId,
      userId: session.user.id,
      action: "member.joined",
      resourceType: "workspace_invitation",
      resourceId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    return apiSuccess({
      workspaceId: invitation.workspaceId,
      workspace: invitation.workspace,
      role: invitation.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// GET /api/invitations/[token]/accept — View invitation details (pre-auth)
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { name: true, slug: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invitation) {
      return apiError("Invitation not found", "NOT_FOUND", 404);
    }

    if (invitation.status !== "pending") {
      return apiError(
        `Invitation has already been ${invitation.status}`,
        "INVITATION_INVALID",
        410
      );
    }

    const expired = new Date() > invitation.expiresAt;

    return apiSuccess({
      email: invitation.email,
      role: invitation.role,
      workspaceName: invitation.workspace.name,
      invitedByName: invitation.invitedBy.name,
      expiresAt: invitation.expiresAt,
      expired,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
