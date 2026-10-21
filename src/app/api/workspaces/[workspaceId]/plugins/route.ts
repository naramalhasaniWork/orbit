import { apiSuccess, apiError } from "@/lib/utils/api";
import type { Prisma } from "@/server/data/types";
import { BUILTIN_PLUGINS, BUILTIN_PLUGIN_MAP } from "@/services/plugins/builtins";
import { route } from "@/server/http/route";

/**
 * GET  /api/workspaces/:workspaceId/plugins — List available and installed plugins
 * POST /api/workspaces/:workspaceId/plugins — Install a plugin
 */

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ workspaceId, db }) => {
    const installations = await db.pluginInstallation.findMany({
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
  }
);

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId, session, db }) => {
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
    const existing = await db.pluginInstallation.findUnique({
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

    const installation = await db.pluginInstallation.create({
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
  }
);
