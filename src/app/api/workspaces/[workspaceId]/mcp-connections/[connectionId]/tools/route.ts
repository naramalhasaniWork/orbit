/**
 * GET /api/workspaces/:workspaceId/mcp-connections/:connectionId/tools
 * List discovered tools for a specific connection.
 */

import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ params: { connectionId }, workspaceId }) => {
    const connection = await prisma.mcpConnection.findFirst({
      where: { id: connectionId, workspaceId },
      select: {
        id: true,
        name: true,
        toolsDiscovered: true,
        lastConnectedAt: true,
      },
    });

    if (!connection) {
      return apiError("Connection not found", "NOT_FOUND", 404);
    }

    const tools = (connection.toolsDiscovered as Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>) ?? [];

    return apiSuccess({
      connectionId: connection.id,
      connectionName: connection.name,
      tools,
      lastConnectedAt: connection.lastConnectedAt,
    });
  }
);
