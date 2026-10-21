import { z } from "zod";
import { assertCanManageRole } from "@/lib/auth/rbac";
import type { MemberRole } from "@/lib/auth/permissions";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { writeAuditLog } from "@/lib/auth/audit";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/workspaces/[workspaceId]/members — List workspace members
// ============================================================

export const GET = route(
  { workspace: "param", permission: "members.view" },
  async ({ workspaceId, db }) => {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId, workspace: { deletedAt: null } },
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
    const tokenUsageByMember = await db.testRun.groupBy({
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
    const lastRuns = await db.testRun.findMany({
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
  }
);

// ============================================================
// PATCH /api/workspaces/[workspaceId]/members — Update a member's role
// ============================================================

const UpdateMemberSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["admin", "member", "viewer", "billing"]),
});

export const PATCH = route(
  { workspace: "param", permission: "members.update_role" },
  async ({ req: request, workspaceId, session, db }) => {
    const body = await request.json();
    const parsed = UpdateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { memberId, role } = parsed.data;

    const target = await db.workspaceMember.findFirst({
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
    assertCanManageRole(session.role, target.role as MemberRole);
    // ...and the new role must stay below the actor's own, or an admin could mint admins
    assertCanManageRole(session.role, role);

    await db.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "member.role_changed",
      resourceType: "workspace_member",
      resourceId: memberId,
      metadata: { targetUserId: target.userId, previousRole: target.role, newRole: role },
    });

    return apiSuccess({ memberId, role });
  }
);

// ============================================================
// DELETE /api/workspaces/[workspaceId]/members — Remove a member
// ============================================================

const RemoveMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export const DELETE = route(
  { workspace: "param", permission: "members.remove" },
  async ({ req: request, workspaceId, session, db }) => {
    const body = await request.json();
    const parsed = RemoveMemberSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { memberId } = parsed.data;

    const target = await db.workspaceMember.findFirst({
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
    if (target.userId === session.user.id) {
      return apiError("Cannot remove yourself", "FORBIDDEN", 403);
    }

    // Actor must outrank target
    assertCanManageRole(session.role, target.role as MemberRole);

    await db.workspaceMember.delete({ where: { id: memberId } });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "member.removed",
      resourceType: "workspace_member",
      resourceId: memberId,
      metadata: { targetUserId: target.userId, targetRole: target.role },
    });

    return apiSuccess({ removed: memberId });
  }
);
