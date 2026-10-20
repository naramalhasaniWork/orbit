import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { generateApiKey } from "@/lib/auth/api-key";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

const API_KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

const MAX_ACTIVE_KEYS = 25;

// ============================================================
// GET /api/workspaces/[workspaceId]/api-keys — List active keys (never hashes)
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.manage");

    const keys = await prisma.apiKey.findMany({
      where: { workspaceId, revokedAt: null },
      select: API_KEY_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(keys);
  } catch (error) {
    return handleApiError(error);
  }
}

const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, "Key name is required").max(100),
});

// ============================================================
// POST /api/workspaces/[workspaceId]/api-keys — Create a key (plaintext returned once)
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { session } = await requirePermission(workspaceId, "settings.manage");

    const parsed = CreateApiKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const activeCount = await prisma.apiKey.count({ where: { workspaceId, revokedAt: null } });
    if (activeCount >= MAX_ACTIVE_KEYS) {
      return apiError(`Limit of ${MAX_ACTIVE_KEYS} active API keys reached`, "LIMIT_REACHED", 400);
    }

    const { key, prefix, keyHash } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        workspaceId,
        name: parsed.data.name,
        prefix,
        keyHash,
        createdBy: session.user.id,
      },
      select: API_KEY_SELECT,
    });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: apiKey.id,
      metadata: { name: apiKey.name, prefix },
    });

    return apiSuccess({ key, apiKey }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
