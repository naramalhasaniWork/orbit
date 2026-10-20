import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requirePermission, assertCanManageRole } from "@/lib/auth/rbac";
import { TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tenant";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";

const INVITE_EXPIRY_DAYS = 7;

// ============================================================
// GET /api/workspaces/[workspaceId]/invitations — List invitations
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "members.invite");

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
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// POST /api/workspaces/[workspaceId]/invitations — Create invitation
// ============================================================

const CreateInvitationSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["admin", "member", "viewer", "billing"]).default("member"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "members.invite");

    const body = await request.json();
    const parsed = CreateInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { email, role } = parsed.data;

    // Cannot invite someone at or above your own level
    assertCanManageRole(ctx.role, role);

    // Check member limit
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { tier: true, memberLimit: true },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    const currentMemberCount = await prisma.workspaceMember.count({
      where: { workspaceId },
    });

    const pendingInviteCount = await prisma.workspaceInvitation.count({
      where: { workspaceId, status: "pending" },
    });

    const tier = workspace.tier as WorkspaceTier;
    const limit = TIER_LIMITS[tier]?.members ?? workspace.memberLimit;

    if (currentMemberCount + pendingInviteCount >= limit) {
      return apiError(
        `Member limit reached (${limit}). Upgrade your plan to add more members.`,
        "LIMIT_REACHED",
        403
      );
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: { email },
      },
    });

    if (existingMember) {
      return apiError("User is already a member", "ALREADY_MEMBER", 409);
    }

    // Check for existing pending invitation
    const existingInvite = await prisma.workspaceInvitation.findFirst({
      where: { workspaceId, email, status: "pending" },
    });

    if (existingInvite) {
      return apiError("Pending invitation already exists for this email", "DUPLICATE_INVITE", 409);
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email: email.toLowerCase().trim(),
        role,
        token,
        invitedById: ctx.session.user.id,
        expiresAt,
      },
    });

    await writeAuditLog({
      workspaceId,
      userId: ctx.session.user.id,
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
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// DELETE /api/workspaces/[workspaceId]/invitations — Revoke invitation
// ============================================================

const RevokeSchema = z.object({
  invitationId: z.string().uuid(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "members.invite");

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
      userId: ctx.session.user.id,
      action: "invitation.revoked",
      resourceType: "workspace_invitation",
      resourceId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    return apiSuccess({ revoked: invitation.id });
  } catch (error) {
    return handleApiError(error);
  }
}
