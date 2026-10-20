/**
 * MCP Client — connects to external MCP servers on behalf of a workspace.
 *
 * Establishes SSE/HTTP connections, discovers tools via JSON-RPC `tools/list`,
 * and calls tools via `tools/call`. Manages a connection pool per workspace run.
 */

import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/vault";
import { safeFetch } from "@/lib/utils/ssrf";

// ============================================================
// Types
// ============================================================

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  connectionId: string;
  connectionName: string;
}

interface McpToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ============================================================
// Connection Pool
// ============================================================

interface PooledConnection {
  connectionId: string;
  serverUrl: string;
  headers: Record<string, string>;
  lastUsedAt: number;
}

const connectionPool = new Map<string, PooledConnection>();

const TOOL_CALL_TIMEOUT_MS = 30_000;
const POOL_CLEANUP_INTERVAL_MS = 60_000;
const POOL_MAX_IDLE_MS = 300_000;

// Periodic pool cleanup
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startPoolCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keys = Array.from(connectionPool.keys());
    for (const key of keys) {
      const conn = connectionPool.get(key);
      if (conn && now - conn.lastUsedAt > POOL_MAX_IDLE_MS) {
        connectionPool.delete(key);
      }
    }
  }, POOL_CLEANUP_INTERVAL_MS);
}

// ============================================================
// Internal Helpers
// ============================================================

function buildHeaders(
  apiKeyEncrypted: string | null,
  apiKeyIv: string | null,
  customHeaders: Record<string, string> | null
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKeyEncrypted && apiKeyIv) {
    const apiKey = decrypt(apiKeyEncrypted, apiKeyIv);
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

async function sendJsonRpc(
  serverUrl: string,
  headers: Record<string, string>,
  method: string,
  params?: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const id = `orbit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_CALL_TIMEOUT_MS);

  try {
    const response = await safeFetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `MCP server returned HTTP ${response.status}: ${response.statusText}`
      );
    }

    const json = (await response.json()) as JsonRpcResponse;

    if (json.error) {
      throw new Error(
        `MCP JSON-RPC error [${json.error.code}]: ${json.error.message}`
      );
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function getOrCreatePooled(
  connectionId: string,
  serverUrl: string,
  headers: Record<string, string>
): PooledConnection {
  const existing = connectionPool.get(connectionId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing;
  }

  const pooled: PooledConnection = {
    connectionId,
    serverUrl,
    headers,
    lastUsedAt: Date.now(),
  };
  connectionPool.set(connectionId, pooled);
  startPoolCleanup();
  return pooled;
}

// ============================================================
// Public API
// ============================================================

/**
 * Discover tools from an external MCP server.
 * Sends `initialize` then `tools/list`, caches the result in the DB.
 */
export async function discoverTools(
  connectionId: string
): Promise<McpToolDefinition[]> {
  const connection = await prisma.mcpConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });

  const headers = buildHeaders(
    connection.apiKeyEncrypted,
    connection.apiKeyIv,
    connection.headers as Record<string, string> | null
  );

  // Initialize handshake
  await sendJsonRpc(connection.serverUrl, headers, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "orbit-mcp-client", version: "1.0.0" },
  });

  // Discover tools
  const response = await sendJsonRpc(
    connection.serverUrl,
    headers,
    "tools/list"
  );

  const result = response.result as {
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  };

  const tools: McpToolDefinition[] = (result.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    connectionId: connection.id,
    connectionName: connection.name,
  }));

  // Cache discovered tools and update last connected timestamp
  await prisma.mcpConnection.update({
    where: { id: connectionId },
    data: {
      toolsDiscovered: JSON.parse(JSON.stringify(tools)),
      lastConnectedAt: new Date(),
    },
  });

  return tools;
}

/**
 * Call a tool on an external MCP server.
 */
export async function callTool(
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolCallResult> {
  const connection = await prisma.mcpConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });

  if (!connection.isActive) {
    throw new Error(`MCP connection "${connection.name}" is disabled`);
  }

  const headers = buildHeaders(
    connection.apiKeyEncrypted,
    connection.apiKeyIv,
    connection.headers as Record<string, string> | null
  );

  const pooled = getOrCreatePooled(connectionId, connection.serverUrl, headers);

  const response = await sendJsonRpc(
    pooled.serverUrl,
    pooled.headers,
    "tools/call",
    { name: toolName, arguments: args }
  );

  const result = response.result as McpToolCallResult | undefined;

  if (!result?.content) {
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  return result;
}

/**
 * Test connectivity to an MCP server. Returns true if handshake succeeds.
 */
export async function testConnection(
  connectionId: string
): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  try {
    const tools = await discoverTools(connectionId);
    return { ok: true, toolCount: tools.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, toolCount: 0, error: message };
  }
}

/**
 * Remove a connection from the pool.
 */
export function disconnectFromPool(connectionId: string): void {
  connectionPool.delete(connectionId);
}
