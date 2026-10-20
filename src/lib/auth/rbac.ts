import { prisma } from "@/lib/db";
import { AuthError } from "@/server/http/errors";
import { getRbacContext, type RbacContext } from "@/server/http/auth";
import {
  roleHasPermission,
  canManageRole,
  type MemberRole,
  type Permission,
} from "./permissions";

// Membership + permission logic lives in server/http/auth (one read per request in route());
// re-exported so routes not yet on route() keep working.
export { getRbacContext, requirePermission, type RbacContext } from "@/server/http/auth";

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
