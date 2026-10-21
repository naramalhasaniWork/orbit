// ============================================================
// Audit Log UI Types
// ============================================================

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userImage?: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  workspaceId?: string;
  workspaceName?: string;
}

export interface AuditPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditFilters {
  action: string;
  userId: string;
  resourceType: string;
  from: string;
  to: string;
  search: string;
}

export interface WorkspaceMemberOption {
  id: string;
  name: string | null;
  email: string;
}

/** Maps action prefixes to color categories for badges. */
const ACTION_COLOR_MAP: Record<string, "green" | "blue" | "amber" | "red" | "purple"> = {
  create: "green",
  invited: "green",
  joined: "green",
  trigger: "green",
  login: "blue",
  view: "blue",
  sync: "blue",
  update: "amber",
  change: "amber",
  settings: "amber",
  transferred: "amber",
  delete: "red",
  removed: "red",
  revoked: "red",
  cancel: "red",
  decision: "purple",
};

export function getActionColor(action: string): "green" | "blue" | "amber" | "red" | "purple" {
  for (const [key, color] of Object.entries(ACTION_COLOR_MAP)) {
    if (action.includes(key)) return color;
  }
  return "blue";
}

export const ACTION_BADGE_CLASSES: Record<string, string> = {
  green: "bg-tm-pass/15 text-tm-pass border-tm-pass/20",
  blue: "bg-tm-info/15 text-tm-info border-tm-info/20",
  amber: "bg-tm-warn/15 text-tm-warn border-tm-warn/20",
  red: "bg-tm-fail/15 text-tm-fail border-tm-fail/20",
  purple: "bg-tm-t2/15 text-tm-t2 border-tm-t2/20",
};

export const RESOURCE_TYPES = [
  "project",
  "run",
  "workspace",
  "workspace_member",
  "session",
];

export const ACTION_OPTIONS = [
  "login",
  "project.create",
  "project.update",
  "project.delete",
  "project.sync",
  "run.trigger",
  "run.cancel",
  "member.invited",
  "member.removed",
  "member.role_changed",
  "member.joined",
  "settings.change",
  "workspace.settings_updated",
  "workspace.deleted",
  "api_key.created",
  "api_key.revoked",
  "agent.decision",
  "ownership.transferred",
  "invitation.revoked",
];
