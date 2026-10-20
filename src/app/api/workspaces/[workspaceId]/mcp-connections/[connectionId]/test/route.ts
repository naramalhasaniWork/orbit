/**
 * POST /api/workspaces/:workspaceId/mcp-connections/:connectionId/test
 * Test connection and rediscover tools.
 */

import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { testConnection } from "@/services/mcp/client";
import { route } from "@/server/http/route";

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ params: { connectionId }, workspaceId }) => {
    const connection = await prisma.mcpConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!connection) {
      return apiError("Connection not found", "NOT_FOUND", 404);
    }

    const result = await testConnection(connectionId);

    if (!result.ok) {
      return apiError(
        result.error ?? "Connection test failed",
        "CONNECTION_FAILED",
        422
      );
    }

    // Fetch updated tools
    const updated = await prisma.mcpConnection.findUnique({
      where: { id: connectionId },
      select: {
        toolsDiscovered: true,
        lastConnectedAt: true,
      },
    });

    return apiSuccess({
      connected: true,
      toolCount: result.toolCount,
      tools: updated?.toolsDiscovered ?? [],
      lastConnectedAt: updated?.lastConnectedAt,
    });
  }
);
