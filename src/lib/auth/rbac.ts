import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/utils/api";
import type { OrbitSession } from "@/lib/utils/types";
import {
  roleHasPermission,
  canManageRole,
  type MemberRole,
  type Permission,
} from "./permissions";

interface RbacContext {
  session: OrbitSession;
  workspaceId: string;
  role: MemberRole;
  memberId: string;
}

/**
 * Get the RBAC context for the current user in a workspace.
 * Looks up the actual membership from the database (not just the JWT).
 */
export async function getRbacContext(workspaceId: string): Promise<RbacContext> {
  const session = await requireAuth();

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_member_unique: {
        workspaceId,
        userId: session.user.id,
      },
    },
    select: { id: true, role: true, workspace: { select: { deletedAt: true } } },
  });

  if (!member) {
    throw new AuthError("Not a member of this workspace", "FORBIDDEN", 403);
  }
  if (member.workspace.deletedAt) {
    throw new AuthError("Workspace has been deleted", "WORKSPACE_DELETED", 403);
  }

  return {
    session,
    workspaceId,
    role: member.role as MemberRole,
    memberId: member.id,
  };
}

/**
 * Require a specific permission. Throws AuthError if denied.
 */
export async function requirePermission(
  workspaceId: string,
  permission: Permission
): Promise<RbacContext> {
  const ctx = await getRbacContext(workspaceId);

  if (!roleHasPermission(ctx.role, permission)) {
    throw new AuthError(
      `Permission denied: ${permission}`,
      "FORBIDDEN",
      403
    );
  }

  return ctx;
}

/**
 * Require at least a specific role level.
 */
export async function requireRole(
  workspaceId: string,
  minimumRole: MemberRole
): Promise<RbacContext> {
  const ctx = await getRbacContext(workspaceId);
  const hierarchy: MemberRole[] = ["viewer", "billing", "member", "admin", "owner"];
  const userLevel = hierarchy.indexOf(ctx.role);
  const requiredLevel = hierarchy.indexOf(minimumRole);

  if (userLevel < requiredLevel) {
    throw new AuthError(
      `Requires at least ${minimumRole} role`,
      "FORBIDDEN",
      403
    );
  }

  return ctx;
}

/**
 * Check if the current user can manage another member's role.
 */
export function assertCanManageRole(
  actorRole: MemberRole,
  targetRole: MemberRole
): void {
  if (!canManageRole(actorRole, targetRole)) {
    throw new AuthError(
      "Cannot manage a member with equal or higher role",
      "FORBIDDEN",
      403
    );
  }
}

/**
 * Check a permission without throwing — returns boolean.
 */
export async function checkPermission(
  userId: string,
  workspaceId: string,
  permission: Permission
): Promise<boolean> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_member_unique: {
        workspaceId,
        userId,
      },
    },
    select: { role: true },
  });

  if (!member) return false;
  return roleHasPermission(member.role as MemberRole, permission);
}
