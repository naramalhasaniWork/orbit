/**
 * Audit logging for sensitive workspace actions.
 * Logs to the audit_logs table for compliance and security.
 */

import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export type AuditAction =
  | "member.role_changed"
  | "member.removed"
  | "member.invited"
  | "member.joined"
  | "member.left"
  | "invitation.revoked"
  | "ownership.transferred"
  | "workspace.settings_updated"
  | "workspace.deleted"
  | "api_key.created"
  | "api_key.revoked"
  | "login"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.sync"
  | "run.trigger"
  | "run.cancel"
  | "settings.change"
  | "agent.decision"
  | "mcp_connection.created"
  | "mcp_connection.updated"
  | "mcp_connection.deleted"
  | "mcp_connection.tool_call";

interface AuditLogInput {
  workspaceId: string;
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

async function getClientIp(): Promise<string | null> {
  try {
    const hdrs = await headers();
    return (
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      hdrs.get("x-real-ip") ??
      null
    );
  } catch {
    return null;
  }
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const ipAddress = input.ipAddress ?? (await getClientIp());

  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: (input.metadata ?? {}) as Record<string, string>,
      ipAddress,
    },
  });
}

// ============================================================
// Domain-specific audit helpers
// ============================================================

export async function auditLogin(
  userId: string,
  workspaceId: string,
  ip?: string
): Promise<void> {
  await writeAuditLog({
    workspaceId,
    userId,
    action: "login",
    resourceType: "session",
    ipAddress: ip ?? null,
  });
}

export async function auditProjectAction(
  action: "create" | "update" | "delete" | "sync",
  userId: string,
  workspaceId: string,
  projectId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await writeAuditLog({
    workspaceId,
    userId,
    action: `project.${action}` as AuditAction,
    resourceType: "project",
    resourceId: projectId,
    metadata,
  });
}

export async function auditRunAction(
  action: "trigger" | "cancel",
  userId: string,
  workspaceId: string,
  runId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await writeAuditLog({
    workspaceId,
    userId,
    action: `run.${action}` as AuditAction,
    resourceType: "run",
    resourceId: runId,
    metadata,
  });
}

export async function auditSettingsChange(
  userId: string,
  workspaceId: string,
  setting: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await writeAuditLog({
    workspaceId,
    userId,
    action: "settings.change",
    resourceType: "workspace",
    resourceId: workspaceId,
    metadata: { setting, ...metadata },
  });
}

export async function auditMemberAction(
  action: "invite" | "remove" | "role_change",
  userId: string,
  workspaceId: string,
  targetUserId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const actionMap: Record<string, AuditAction> = {
    invite: "member.invited",
    remove: "member.removed",
    role_change: "member.role_changed",
  };

  await writeAuditLog({
    workspaceId,
    userId,
    action: actionMap[action] ?? "member.invited",
    resourceType: "workspace_member",
    resourceId: targetUserId,
    metadata,
  });
}

export async function auditAgentDecision(
  workspaceId: string,
  agentPhase: string,
  decision: string,
  runId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await writeAuditLog({
    workspaceId,
    action: "agent.decision",
    resourceType: "run",
    resourceId: runId,
    metadata: { agentPhase, decision, ...metadata },
  });
}
