import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import type { Prisma } from "@/generated/prisma/client";
import { BUILTIN_PLUGINS, BUILTIN_PLUGIN_MAP } from "@/services/plugins/builtins";

/**
 * GET  /api/workspaces/:workspaceId/plugins — List available and installed plugins
 * POST /api/workspaces/:workspaceId/plugins — Install a plugin
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await requirePermission(workspaceId, "settings.view");

    const installations = await prisma.pluginInstallation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });

    const installedMap = new Map(
      installations.map((i) => [i.pluginName, i])
    );

    const plugins = BUILTIN_PLUGINS.map((def) => {
      const installation = installedMap.get(def.name);
      return {
        name: def.name,
        version: def.version,
        description: def.description,
        hooks: Object.keys(def.hooks),
        installed: !!installation,
        enabled: installation?.isEnabled ?? false,
        config: installation?.config ?? def.defaultConfig ?? {},
        installedAt: installation?.createdAt ?? null,
      };
    });

    return apiSuccess({ plugins });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { session } = await requirePermission(workspaceId, "settings.manage");

    const body = await request.json();
    const { pluginName, config } = body as {
      pluginName: string;
      config?: Record<string, unknown>;
    };

    if (!pluginName || typeof pluginName !== "string") {
      return apiError("pluginName is required", "VALIDATION_ERROR", 400);
    }

    // Verify plugin exists in the builtin registry
    const definition = BUILTIN_PLUGIN_MAP[pluginName];
    if (!definition) {
      return apiError(
        `Unknown plugin: ${pluginName}`,
        "NOT_FOUND",
        404
      );
    }

    // Check if already installed
    const existing = await prisma.pluginInstallation.findUnique({
      where: {
        plugin_installation_unique: { workspaceId, pluginName },
      },
    });

    if (existing) {
      return apiError(
        `Plugin "${pluginName}" is already installed`,
        "CONFLICT",
        409
      );
    }

    const installation = await prisma.pluginInstallation.create({
      data: {
        workspaceId,
        pluginName,
        version: definition.version,
        isEnabled: true,
        config: JSON.parse(JSON.stringify(config ?? definition.defaultConfig ?? {})) as Prisma.InputJsonValue,
        installedBy: session.user.id,
      },
    });

    return apiSuccess(
      {
        name: installation.pluginName,
        version: installation.version,
        enabled: installation.isEnabled,
        config: installation.config,
        installedAt: installation.createdAt,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
