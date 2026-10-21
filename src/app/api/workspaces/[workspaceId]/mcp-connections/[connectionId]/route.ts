/**
 * PUT    /api/workspaces/:workspaceId/mcp-connections/:connectionId — Update connection
 * DELETE /api/workspaces/:workspaceId/mcp-connections/:connectionId — Delete connection
 */

import { apiSuccess, apiError } from "@/lib/utils/api";
import { encrypt } from "@/lib/vault";
import { writeAuditLog } from "@/lib/auth/audit";
import { disconnectFromPool } from "@/services/mcp/client";
import type { Prisma } from "@/server/data/types";
import { route } from "@/server/http/route";

export const PUT = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, params: { connectionId }, workspaceId, session, db }) => {
    const existing = await db.mcpConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!existing) {
      return apiError("Connection not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { name, description, serverUrl, transportType, apiKey, headers, isActive } =
      body as {
        name?: string;
        description?: string;
        serverUrl?: string;
        transportType?: string;
        apiKey?: string;
        headers?: Record<string, string>;
        isActive?: boolean;
      };

    const data: Prisma.McpConnectionUpdateInput = {};

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (serverUrl !== undefined) {
      try {
        new URL(serverUrl);
      } catch {
        return apiError("serverUrl must be a valid URL", "VALIDATION_ERROR", 400);
      }
      data.serverUrl = serverUrl;
    }
    if (transportType !== undefined) data.transportType = transportType;
    if (isActive !== undefined) data.isActive = isActive;
    if (headers !== undefined) {
      data.headers = JSON.parse(JSON.stringify(headers)) as Prisma.InputJsonValue;
    }

    if (apiKey !== undefined) {
      if (apiKey === "") {
        data.apiKeyEncrypted = null;
        data.apiKeyIv = null;
      } else {
        const encrypted = encrypt(apiKey);
        data.apiKeyEncrypted = encrypted.encrypted;
        data.apiKeyIv = encrypted.iv;
      }
    }

    const updated = await db.mcpConnection.update({
      where: { id: connectionId },
      data,
    });

    // Remove from pool so next call uses fresh config
    disconnectFromPool(connectionId);

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "mcp_connection.updated",
      resourceType: "mcp_connection",
      resourceId: connectionId,
      metadata: { fields: Object.keys(body) },
    });

    return apiSuccess({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      serverUrl: updated.serverUrl,
      transportType: updated.transportType,
      isActive: updated.isActive,
      hasApiKey: !!updated.apiKeyEncrypted,
      toolsDiscovered: updated.toolsDiscovered,
      lastConnectedAt: updated.lastConnectedAt,
    });
  }
);

export const DELETE = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ params: { connectionId }, workspaceId, session, db }) => {
    const existing = await db.mcpConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!existing) {
      return apiError("Connection not found", "NOT_FOUND", 404);
    }

    await db.mcpConnection.delete({ where: { id: connectionId } });
    disconnectFromPool(connectionId);

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "mcp_connection.deleted",
      resourceType: "mcp_connection",
      resourceId: connectionId,
      metadata: { name: existing.name },
    });

    return apiSuccess({ deleted: true });
  }
);
