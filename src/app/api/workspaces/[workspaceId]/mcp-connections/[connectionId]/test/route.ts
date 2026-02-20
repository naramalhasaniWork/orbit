/**
 * POST /api/workspaces/:workspaceId/mcp-connections/:connectionId/test
 * Test connection and rediscover tools.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { testConnection } from "@/services/mcp/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; connectionId: string }> }
) {
  try {
    const { workspaceId, connectionId } = await params;
    await requirePermission(workspaceId, "settings.manage");

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
  } catch (error) {
    return handleApiError(error);
  }
}
