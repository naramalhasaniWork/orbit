// ============================================================
// RBAC Permission Definitions
// ============================================================

export type MemberRole = "owner" | "admin" | "member" | "viewer" | "billing";

export type Permission =
  // Workspace management
  | "workspace.delete"
  | "workspace.update"
  | "workspace.transfer"
  | "workspace.view"
  // Billing
  | "billing.manage"
  | "billing.view"
  // Members
  | "members.invite"
  | "members.remove"
  | "members.update_role"
  | "members.view"
  // Projects
  | "projects.create"
  | "projects.delete"
  | "projects.update"
  | "projects.view"
  // Test runs
  | "runs.create"
  | "runs.cancel"
  | "runs.view"
  // Test plans
  | "plans.create"
  | "plans.update"
  | "plans.approve"
  | "plans.view"
  // Integrations
  | "integrations.manage"
  | "integrations.view"
  // Secrets
  | "secrets.manage"
  | "secrets.view"
  // Settings
  | "settings.manage"
  | "settings.view"
  // Audit logs
  | "audit.view";

const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  owner: [
    "workspace.delete",
    "workspace.update",
    "workspace.transfer",
    "workspace.view",
    "billing.manage",
    "billing.view",
    "members.invite",
    "members.remove",
    "members.update_role",
    "members.view",
    "projects.create",
    "projects.delete",
    "projects.update",
    "projects.view",
    "runs.create",
    "runs.cancel",
    "runs.view",
    "plans.create",
    "plans.update",
    "plans.approve",
    "plans.view",
    "integrations.manage",
    "integrations.view",
    "secrets.manage",
    "secrets.view",
    "settings.manage",
    "settings.view",
    "audit.view",
  ],
  admin: [
    "workspace.update",
    "workspace.view",
    "billing.view",
    "members.invite",
    "members.remove",
    "members.update_role",
    "members.view",
    "projects.create",
    "projects.delete",
    "projects.update",
    "projects.view",
    "runs.create",
    "runs.cancel",
    "runs.view",
    "plans.create",
    "plans.update",
    "plans.approve",
    "plans.view",
    "integrations.manage",
    "integrations.view",
    "secrets.manage",
    "secrets.view",
    "settings.manage",
    "settings.view",
    "audit.view",
  ],
  member: [
    "workspace.view",
    "members.view",
    "projects.create",
    "projects.update",
    "projects.view",
    "runs.create",
    "runs.view",
    "plans.create",
    "plans.update",
    "plans.view",
    "integrations.view",
    "secrets.view",
    "settings.view",
  ],
  viewer: [
    "workspace.view",
    "members.view",
    "projects.view",
    "runs.view",
    "plans.view",
    "integrations.view",
    "settings.view",
  ],
  billing: [
    "workspace.view",
    "billing.manage",
    "billing.view",
    "members.view",
    "settings.view",
  ],
};

/** Check if a role has a specific permission. */
export function roleHasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Get all permissions for a role. */
export function getPermissionsForRole(role: MemberRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Role hierarchy — higher index = more powerful. */
const ROLE_HIERARCHY: MemberRole[] = ["viewer", "billing", "member", "admin", "owner"];

/** Check if roleA is at least as powerful as roleB. */
export function isRoleAtLeast(roleA: MemberRole, roleB: MemberRole): boolean {
  return ROLE_HIERARCHY.indexOf(roleA) >= ROLE_HIERARCHY.indexOf(roleB);
}

/** Check if a role can modify another role (must be strictly higher). */
export function canManageRole(actorRole: MemberRole, targetRole: MemberRole): boolean {
  return ROLE_HIERARCHY.indexOf(actorRole) > ROLE_HIERARCHY.indexOf(targetRole);
}

/** Roles that owners/admins can assign to others. */
export function getAssignableRoles(actorRole: MemberRole): MemberRole[] {
  const actorIndex = ROLE_HIERARCHY.indexOf(actorRole);
  return ROLE_HIERARCHY.filter((_, i) => i < actorIndex);
}
