import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// DELETE /api/workspaces/[workspaceId]/api-keys/[keyId] — Revoke a key
// ============================================================

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ params: { keyId }, workspaceId, session }) => {
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
  }
);
