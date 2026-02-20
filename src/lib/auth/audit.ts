/**
 * Audit logging for sensitive workspace actions.
 * Logs to the audit_logs table for compliance and security.
 */

import { prisma } from "@/lib/db";
import { headers } from "next/headers";

type AuditAction =
  | "member.role_changed"
  | "member.removed"
  | "member.invited"
  | "member.joined"
  | "invitation.revoked"
  | "ownership.transferred"
  | "workspace.settings_updated"
  | "workspace.deleted"
  | "api_key.created"
  | "api_key.revoked";

interface AuditLogInput {
  workspaceId: string;
  userId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
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
  const ipAddress = await getClientIp();

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
