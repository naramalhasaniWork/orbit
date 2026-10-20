import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

// ============================================================
// DELETE /api/workspaces/[workspaceId]/api-keys/[keyId] — Revoke a key
// ============================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; keyId: string }> }
) {
  try {
    const { workspaceId, keyId } = await params;
    const { session } = await requirePermission(workspaceId, "settings.manage");

    const existing = await prisma.apiKey.findFirst({
      where: { id: keyId, workspaceId, revokedAt: null },
      select: { id: true, name: true, prefix: true },
    });

    if (!existing) {
      return apiError("API key not found", "NOT_FOUND", 404);
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "api_key.revoked",
      resourceType: "api_key",
      resourceId: keyId,
      metadata: { name: existing.name, prefix: existing.prefix },
    });

    return apiSuccess({ revoked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
