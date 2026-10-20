import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCanManageRole } from "@/lib/auth/rbac";
import { canConsume } from "@/lib/auth/tenant";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";
import { newInviteExpiry, newInviteToken, normalizeInviteEmail } from "@/lib/invitations";
import { deliverInviteEmail } from "@/lib/email/invite-email";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/workspaces/[workspaceId]/invitations — List invitations
// ============================================================

export const GET = route(
  { workspace: "param", permission: "members.invite" },
  async ({ workspaceId }) => {
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(invitations);
  }
);

// ============================================================
// POST /api/workspaces/[workspaceId]/invitations — Create invitation
// ============================================================

const CreateInvitationSchema = z.object({
  email: z.string().trim().email("Valid email required"),
  role: z.enum(["admin", "member", "viewer", "billing"]).default("member"),
});

export const POST = route(
  { workspace: "param", permission: "members.invite" },
  async ({ req: request, workspaceId, session }) => {
    const body = await request.json();
    const parsed = CreateInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { role } = parsed.data;
    const email = normalizeInviteEmail(parsed.data.email);
    const now = new Date();

    // Cannot invite someone at or above your own level
    assertCanManageRole(session.role, role);

    const allowance = await canConsume(workspaceId, "member");
    if (!allowance.allowed) {
      return apiError(allowance.reason, allowance.code, allowance.code === "NOT_FOUND" ? 404 : 403);
    }

    // Check if already a member. Candidates are narrowed by the database and
    // compared exactly in code, since insensitive equality treats % and _ as wildcards.
    const candidates = await prisma.workspaceMember.findMany({
      where: { workspaceId, user: { email: { equals: email, mode: "insensitive" } } },
      select: { user: { select: { email: true } } },
    });
    if (candidates.some((m) => m.user.email?.toLowerCase() === email)) {
      return apiError("User is already a member", "ALREADY_MEMBER", 409);
    }

    // A live pending invitation blocks a duplicate; an expired one is replaced
    const pending = await prisma.workspaceInvitation.findMany({
      where: { workspaceId, email, status: "pending" },
      select: { id: true, expiresAt: true },
    });
    if (pending.some((i) => i.expiresAt > now)) {
      return apiError("Pending invitation already exists for this email", "DUPLICATE_INVITE", 409);
    }
    if (pending.length > 0) {
      await prisma.workspaceInvitation.updateMany({
        where: { id: { in: pending.map((i) => i.id) } },
        data: { status: "expired" },
      });
    }

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        token: newInviteToken(),
        invitedById: session.user.id,
        expiresAt: newInviteExpiry(now),
      },
    });

    const emailResult = await deliverInviteEmail(workspaceId, invitation, session.user.name ?? null);

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "member.invited",
      resourceType: "workspace_invitation",
      resourceId: invitation.id,
      metadata: { email, role },
    });

    return apiSuccess({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
      emailSent: emailResult.sent,
    }, 201);
  }
);

// ============================================================
// DELETE /api/workspaces/[workspaceId]/invitations — Revoke invitation
// ============================================================

const RevokeSchema = z.object({
  invitationId: z.string().uuid(),
});

export const DELETE = route(
  { workspace: "param", permission: "members.invite" },
  async ({ req: request, workspaceId, session }) => {
    const body = await request.json();
    const parsed = RevokeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const invitation = await prisma.workspaceInvitation.findFirst({
      where: { id: parsed.data.invitationId, workspaceId, status: "pending" },
    });

    if (!invitation) {
      return apiError("Invitation not found or already processed", "NOT_FOUND", 404);
    }

    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "revoked" },
    });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "invitation.revoked",
      resourceType: "workspace_invitation",
      resourceId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    return apiSuccess({ revoked: invitation.id });
  }
);
