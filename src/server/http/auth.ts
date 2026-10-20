import { prisma } from "@/lib/db";
import { roleHasPermission, type MemberRole, type Permission } from "@/lib/auth/permissions";
import type { OrbitSession } from "@/lib/utils/types";
import { AuthError } from "./errors";
import { requireAuth } from "./session";

export interface Membership {
  memberId: string;
  role: MemberRole;
}

export interface RbacContext {
  session: OrbitSession;
  workspaceId: string;
  role: MemberRole;
  memberId: string;
}

/**
 * The user's membership in a workspace, read from the database on every request
 * (the JWT lives for hours, so it must not decide who is still a member or what
 * role they hold). A soft-deleted workspace admits nobody. This is the one
 * membership read a request makes; route() calls it once and reuses the result.
 */
export async function loadMembership(userId: string, workspaceId: string): Promise<Membership> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_member_unique: { workspaceId, userId },
      workspace: { deletedAt: null },
    },
    select: { id: true, role: true, workspace: { select: { deletedAt: true } } },
  });

  if (!member) {
    throw new AuthError("Not a member of this workspace", "FORBIDDEN", 403);
  }
  if (member.workspace.deletedAt) {
    throw new AuthError("Workspace has been deleted", "WORKSPACE_DELETED", 403);
  }

  return { memberId: member.id, role: member.role as MemberRole };
}

/** Throws AuthError unless `role` holds `permission`. */
export function assertPermission(role: MemberRole, permission: Permission): void {
  if (!roleHasPermission(role, permission)) {
    throw new AuthError(`Permission denied: ${permission}`, "FORBIDDEN", 403);
  }
}

/** The RBAC context for the current user in the given workspace. */
export async function getRbacContext(workspaceId: string): Promise<RbacContext> {
  const session = await requireAuth();
  const { memberId, role } = await loadMembership(session.user.id, workspaceId);
  return { session, workspaceId, role, memberId };
}

/** Require a specific permission. Throws AuthError if denied. */
export async function requirePermission(
  workspaceId: string,
  permission: Permission
): Promise<RbacContext> {
  const ctx = await getRbacContext(workspaceId);
  assertPermission(ctx.role, permission);
  return ctx;
}

/** The session's workspace, with membership and role re-read from the database. */
export async function requireWorkspace(): Promise<{
  session: OrbitSession;
  workspaceId: string;
  role: string;
}> {
  const session = await requireAuth();

  if (!session.workspaceId) {
    throw new AuthError("No workspace found", "NO_WORKSPACE", 403);
  }

  const { role } = await loadMembership(session.user.id, session.workspaceId);

  return { session: { ...session, role }, workspaceId: session.workspaceId, role };
}
