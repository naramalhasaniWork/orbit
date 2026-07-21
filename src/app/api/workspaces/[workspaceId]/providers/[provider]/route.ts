import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { encrypt } from "@/lib/vault";
import { syncModelsToRegistry } from "@/lib/ai/providers/openrouter";

function maskApiKey(encrypted: string | null): string | null {
  if (!encrypted) return null;
  const last4 = encrypted.slice(-4);
  return `••••••••${last4}`;
}

interface PutBody {
  displayName?: string;
  apiKey?: string;
  baseUrl?: string;
  isActive?: boolean;
  isDefault?: boolean;
  settings?: Record<string, unknown>;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; provider: string }> }
) {
  try {
    const { workspaceId, provider } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const existing = await prisma.providerConfig.findUnique({
      where: { provider_config_unique: { workspaceId, provider } },
    });

    if (!existing) {
      return apiError("Provider config not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as PutBody;
    const { displayName, apiKey, baseUrl, isActive, isDefault, settings } = body;

    let apiKeyEncrypted: string | null | undefined;
    if (apiKey !== undefined) {
      if (apiKey === "") {
        // Clear the API key
        apiKeyEncrypted = null;
      } else {
        const { encrypted, iv } = encrypt(apiKey);
        apiKeyEncrypted = `${iv}:${encrypted}`;
      }
    }

    // If setting this provider as default, unset other defaults
    if (isDefault === true) {
      await prisma.providerConfig.updateMany({
        where: { workspaceId, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (apiKeyEncrypted !== undefined) updateData.apiKeyEncrypted = apiKeyEncrypted;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (settings !== undefined) updateData.settings = settings;

    const updated = await prisma.providerConfig.update({
      where: { id: existing.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: ctx.session.user.id,
        action: "provider.update",
        resourceType: "ProviderConfig",
        resourceId: updated.id,
        metadata: {
          provider,
          fieldsUpdated: Object.keys(body),
          apiKeyChanged: apiKey !== undefined,
        },
      },
    });

    // Refresh the model registry when a new OpenRouter key lands
    if (provider === "openrouter" && apiKey) {
      syncModelsToRegistry(apiKey).catch((err) =>
        console.error("[Providers] OpenRouter model sync failed:", err)
      );
    }

    return apiSuccess({
      id: updated.id,
      provider: updated.provider,
      displayName: updated.displayName,
      isActive: updated.isActive,
      isDefault: updated.isDefault,
      baseUrl: updated.baseUrl,
      settings: updated.settings,
      apiKeyConfigured: !!updated.apiKeyEncrypted,
      apiKeyHint: maskApiKey(updated.apiKeyEncrypted),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; provider: string }> }
) {
  try {
    const { workspaceId, provider } = await params;
    const ctx = await requirePermission(workspaceId, "settings.manage");

    const existing = await prisma.providerConfig.findUnique({
      where: { provider_config_unique: { workspaceId, provider } },
    });

    if (!existing) {
      return apiError("Provider config not found", "NOT_FOUND", 404);
    }

    await prisma.providerConfig.delete({ where: { id: existing.id } });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: ctx.session.user.id,
        action: "provider.delete",
        resourceType: "ProviderConfig",
        resourceId: existing.id,
        metadata: { provider },
      },
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
