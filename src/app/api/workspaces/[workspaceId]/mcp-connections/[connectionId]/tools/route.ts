/**
 * GET /api/workspaces/:workspaceId/mcp-connections/:connectionId/tools
 * List discovered tools for a specific connection.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; connectionId: string }> }
) {
  try {
    const { workspaceId, connectionId } = await params;
    await requirePermission(workspaceId, "settings.view");

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
  } catch (error) {
    return handleApiError(error);
  }
}
