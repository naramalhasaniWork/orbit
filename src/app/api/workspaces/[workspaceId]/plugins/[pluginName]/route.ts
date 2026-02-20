import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

/**
 * PATCH  /api/workspaces/:workspaceId/plugins/:pluginName — Enable/disable or update config
 * DELETE /api/workspaces/:workspaceId/plugins/:pluginName — Uninstall plugin
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; pluginName: string }> }
) {
  try {
    const { workspaceId, pluginName } = await params;
    await requirePermission(workspaceId, "settings.manage");

    const body = await request.json();
    const { enabled, config } = body as {
      enabled?: boolean;
      config?: Record<string, unknown>;
    };

    const installation = await prisma.pluginInstallation.findUnique({
      where: {
        plugin_installation_unique: { workspaceId, pluginName },
      },
    });

    if (!installation) {
      return apiError(
        `Plugin "${pluginName}" is not installed`,
        "NOT_FOUND",
        404
      );
    }

    const updateData: Record<string, unknown> = {};

    if (enabled !== undefined) {
      if (typeof enabled !== "boolean") {
        return apiError("enabled must be a boolean", "VALIDATION_ERROR", 400);
      }
      updateData.isEnabled = enabled;
    }

    if (config !== undefined) {
      if (typeof config !== "object" || config === null) {
        return apiError("config must be an object", "VALIDATION_ERROR", 400);
      }
      const currentConfig = (installation.config ?? {}) as Record<string, unknown>;
      updateData.config = { ...currentConfig, ...config };
    }

    const updated = await prisma.pluginInstallation.update({
      where: { id: installation.id },
      data: updateData,
    });

    return apiSuccess({
      name: updated.pluginName,
      version: updated.version,
      enabled: updated.isEnabled,
      config: updated.config,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; pluginName: string }> }
) {
  try {
    const { workspaceId, pluginName } = await params;
    await requirePermission(workspaceId, "settings.manage");

    const installation = await prisma.pluginInstallation.findUnique({
      where: {
        plugin_installation_unique: { workspaceId, pluginName },
      },
    });

    if (!installation) {
      return apiError(
        `Plugin "${pluginName}" is not installed`,
        "NOT_FOUND",
        404
      );
    }

    await prisma.pluginInstallation.delete({
      where: { id: installation.id },
    });

    return apiSuccess({ uninstalled: pluginName });
  } catch (error) {
    return handleApiError(error);
  }
}
