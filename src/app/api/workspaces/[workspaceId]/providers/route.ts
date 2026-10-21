import { assertPublicUrl, UnsafeUrlError } from "@/lib/utils/ssrf";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { encrypt } from "@/lib/vault";
import { syncModelsToRegistry } from "@/server/ai/openrouter-registry";
import type { Prisma } from "@/server/data/types";
import { forWorkspace } from "@/server/data/scope";

const VALID_PROVIDERS = ["anthropic", "openai", "openrouter", "custom"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function maskApiKey(encrypted: string | null): string | null {
  if (!encrypted) return null;
  // Show only last 4 chars of the encrypted blob as a hint
  const last4 = encrypted.slice(-4);
  return `••••••••${last4}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const db = forWorkspace(workspaceId);
    await requirePermission(workspaceId, "settings.view");

    const configs = await db.providerConfig.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });

    const result = configs.map((c) => ({
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
      isActive: c.isActive,
      isDefault: c.isDefault,
      baseUrl: c.baseUrl,
      settings: c.settings,
      apiKeyConfigured: !!c.apiKeyEncrypted,
      apiKeyHint: maskApiKey(c.apiKeyEncrypted),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostBody {
  provider: string;
  displayName?: string;
  apiKey?: string;
  baseUrl?: string;
  settings?: Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");
    const db = forWorkspace({ workspaceId, memberUserId: ctx.session.user.id });

    const body = (await request.json()) as PostBody;
    const { provider, displayName, apiKey, baseUrl, settings } = body;

    // baseUrl is later called with the API key attached: reject internal targets up front
    // (the test route re-checks at call time)
    if (baseUrl) {
      try {
        await assertPublicUrl(baseUrl);
      } catch (err) {
        if (err instanceof UnsafeUrlError) {
          return apiError(`Base URL is not allowed: ${err.message}`, "VALIDATION_ERROR", 400);
        }
        throw err;
      }
    }

    if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
      return apiError(
        `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Check if provider already exists for this workspace
    const existing = await db.providerConfig.findUnique({
      where: { provider_config_unique: { workspaceId, provider } },
    });

    if (existing) {
      return apiError(
        `Provider "${provider}" is already configured for this workspace`,
        "CONFLICT",
        409
      );
    }

    let apiKeyEncrypted: string | null = null;
    if (apiKey) {
      const { encrypted, iv } = encrypt(apiKey);
      // Store IV + encrypted together, separated by a colon
      apiKeyEncrypted = `${iv}:${encrypted}`;
    }

    const config = await db.providerConfig.create({
      data: {
        workspaceId,
        provider,
        displayName: displayName ?? null,
        apiKeyEncrypted,
        baseUrl: baseUrl ?? null,
        isActive: true,
        isDefault: false,
        settings: (settings as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        workspaceId,
        userId: ctx.session.user.id,
        action: "provider.create",
        resourceType: "ProviderConfig",
        resourceId: config.id,
        metadata: { provider },
      },
    });

    // Populate the model registry so the new key's models are selectable
    if (provider === "openrouter" && apiKey) {
      syncModelsToRegistry(apiKey).catch((err) =>
        console.error("[Providers] OpenRouter model sync failed:", err)
      );
    }

    return apiSuccess(
      {
        id: config.id,
        provider: config.provider,
        displayName: config.displayName,
        isActive: config.isActive,
        isDefault: config.isDefault,
        baseUrl: config.baseUrl,
        settings: config.settings,
        apiKeyConfigured: !!config.apiKeyEncrypted,
        apiKeyHint: maskApiKey(config.apiKeyEncrypted),
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
