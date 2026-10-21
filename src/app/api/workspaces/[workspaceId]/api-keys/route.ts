import { z } from "zod";
import { generateApiKey } from "@/lib/auth/api-key";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

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

export const GET = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ workspaceId, db }) => {
    const keys = await db.apiKey.findMany({
      where: { workspaceId, revokedAt: null },
      select: API_KEY_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(keys);
  }
);

const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, "Key name is required").max(100),
});

// ============================================================
// POST /api/workspaces/[workspaceId]/api-keys — Create a key (plaintext returned once)
// ============================================================

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId, session, db }) => {
    const parsed = CreateApiKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const activeCount = await db.apiKey.count({ where: { workspaceId, revokedAt: null } });
    if (activeCount >= MAX_ACTIVE_KEYS) {
      return apiError(`Limit of ${MAX_ACTIVE_KEYS} active API keys reached`, "LIMIT_REACHED", 400);
    }

    const { key, prefix, keyHash } = generateApiKey();
    const apiKey = await db.apiKey.create({
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
  }
);
