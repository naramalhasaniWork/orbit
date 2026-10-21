/**
 * GET  /api/workspaces/:workspaceId/mcp-connections — List MCP connections
 * POST /api/workspaces/:workspaceId/mcp-connections — Add a new MCP connection
 */

import { apiSuccess, apiError } from "@/lib/utils/api";
import { encrypt } from "@/lib/vault";
import { writeAuditLog } from "@/lib/auth/audit";
import { testConnection } from "@/services/mcp/client";
import type { Prisma } from "@/server/data/types";
import { route } from "@/server/http/route";

export const GET = route(
  { workspace: "param", permission: "settings.view" },
  async ({ workspaceId, db }) => {
    const connections = await db.mcpConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        serverUrl: true,
        transportType: true,
        isActive: true,
        toolsDiscovered: true,
        lastConnectedAt: true,
        headers: true,
        createdAt: true,
        updatedAt: true,
        // Exclude apiKeyEncrypted and apiKeyIv
      },
    });

    const masked = connections.map((c) => ({
      ...c,
      hasApiKey: false, // Will check from full record below
    }));

    // Check which connections have API keys set
    const fullConnections = await db.mcpConnection.findMany({
      where: { workspaceId },
      select: { id: true, apiKeyEncrypted: true },
    });
    const keyMap = new Map(
      fullConnections.map((c) => [c.id, !!c.apiKeyEncrypted])
    );
    for (const conn of masked) {
      conn.hasApiKey = keyMap.get(conn.id) ?? false;
    }

    return apiSuccess(masked);
  }
);

export const POST = route(
  { workspace: "param", permission: "settings.manage" },
  async ({ req: request, workspaceId, session, db }) => {
    const body = await request.json();
    const { name, description, serverUrl, transportType, apiKey, headers } =
      body as {
        name: string;
        description?: string;
        serverUrl: string;
        transportType?: string;
        apiKey?: string;
        headers?: Record<string, string>;
      };

    if (!name || typeof name !== "string") {
      return apiError("name is required", "VALIDATION_ERROR", 400);
    }
    if (!serverUrl || typeof serverUrl !== "string") {
      return apiError("serverUrl is required", "VALIDATION_ERROR", 400);
    }

    // Validate URL format
    try {
      new URL(serverUrl);
    } catch {
      return apiError("serverUrl must be a valid URL", "VALIDATION_ERROR", 400);
    }

    // Encrypt API key if provided
    let apiKeyEncrypted: string | null = null;
    let apiKeyIv: string | null = null;
    if (apiKey) {
      const encrypted = encrypt(apiKey);
      apiKeyEncrypted = encrypted.encrypted;
      apiKeyIv = encrypted.iv;
    }

    const connection = await db.mcpConnection.create({
      data: {
        workspaceId,
        name,
        description: description ?? null,
        serverUrl,
        transportType: transportType ?? "sse",
        apiKeyEncrypted,
        apiKeyIv,
        headers: headers ? (JSON.parse(JSON.stringify(headers)) as Prisma.InputJsonValue) : undefined,
        isActive: true,
      },
    });

    // Audit log
    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "mcp_connection.created",
      resourceType: "mcp_connection",
      resourceId: connection.id,
      metadata: { name, serverUrl },
    });

    // Attempt initial tool discovery (non-blocking)
    testConnection(connection.id).catch((err) => {
      console.warn(`[mcp-client] Initial discovery failed for ${connection.id}:`, err);
    });

    return apiSuccess(
      {
        id: connection.id,
        name: connection.name,
        description: connection.description,
        serverUrl: connection.serverUrl,
        transportType: connection.transportType,
        isActive: connection.isActive,
        hasApiKey: !!apiKeyEncrypted,
        toolsDiscovered: null,
        lastConnectedAt: null,
        createdAt: connection.createdAt,
      },
      201
    );
  }
);
