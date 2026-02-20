import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, assertCanManageRole } from "@/lib/auth/rbac";
import type { MemberRole } from "@/lib/auth/permissions";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";

// ============================================================
// GET /api/workspaces/[workspaceId]/members — List workspace members
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "members.view");

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Get billing period start for token usage aggregation
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Aggregate token usage per member (via triggeredBy on test runs)
    const memberIds = members.map((m) => m.userId);
    const tokenUsageByMember = await prisma.testRun.groupBy({
      by: ["triggeredById"],
      where: {
        project: { workspaceId },
        triggeredById: { in: memberIds },
        createdAt: { gte: monthStart },
      },
      _sum: { creditsConsumed: true },
      _count: true,
    });

    const usageMap = new Map(
      tokenUsageByMember.map((u) => [
        u.triggeredById,
        { credits: u._sum.creditsConsumed ?? 0, runs: u._count },
      ])
    );

    // Get last activity per member (most recent run they triggered)
    const lastRuns = await prisma.testRun.findMany({
      where: {
        project: { workspaceId },
        triggeredById: { in: memberIds },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["triggeredById"],
      select: { triggeredById: true, createdAt: true },
    });

    const lastActiveMap = new Map(
      lastRuns.map((r) => [r.triggeredById, r.createdAt])
    );

    return apiSuccess(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
        user: m.user,
        usage: usageMap.get(m.userId) ?? { credits: 0, runs: 0 },
        lastActiveAt: lastActiveMap.get(m.userId) ?? null,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// PATCH /api/workspaces/[workspaceId]/members — Update a member's role
// ============================================================

const UpdateMemberSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["admin", "member", "viewer", "billing"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "members.update_role");

    const body = await request.json();
    const parsed = UpdateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { memberId, role } = parsed.data;

    const target = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });

    if (!target) {
      return apiError("Member not found", "NOT_FOUND", 404);
    }

    // Cannot change the owner's role
    if (target.role === "owner") {
      return apiError("Cannot change the workspace owner's role", "FORBIDDEN", 403);
    }

    // Actor must outrank the target's current role
    assertCanManageRole(ctx.role, target.role as MemberRole);

    await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });

    await writeAuditLog({
      workspaceId,
      userId: ctx.session.user.id,
      action: "member.role_changed",
      resourceType: "workspace_member",
      resourceId: memberId,
      metadata: { targetUserId: target.userId, previousRole: target.role, newRole: role },
    });

    return apiSuccess({ memberId, role });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================
// DELETE /api/workspaces/[workspaceId]/members — Remove a member
// ============================================================

const RemoveMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "members.remove");

    const body = await request.json();
    const parsed = RemoveMemberSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { memberId } = parsed.data;

    const target = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });

    if (!target) {
      return apiError("Member not found", "NOT_FOUND", 404);
    }

    // Cannot remove the owner
    if (target.role === "owner") {
      return apiError("Cannot remove the workspace owner", "FORBIDDEN", 403);
    }

    // Cannot remove yourself (use leave instead)
    if (target.userId === ctx.session.user.id) {
      return apiError("Cannot remove yourself", "FORBIDDEN", 403);
    }

    // Actor must outrank target
    assertCanManageRole(ctx.role, target.role as MemberRole);

    await prisma.workspaceMember.delete({ where: { id: memberId } });

    await writeAuditLog({
      workspaceId,
      userId: ctx.session.user.id,
      action: "member.removed",
      resourceType: "workspace_member",
      resourceId: memberId,
      metadata: { targetUserId: target.userId, targetRole: target.role },
    });

    return apiSuccess({ removed: memberId });
  } catch (error) {
    return handleApiError(error);
  }
}
