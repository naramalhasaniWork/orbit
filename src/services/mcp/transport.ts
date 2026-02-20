/**
 * MCP Transport — JSON-RPC 2.0 over HTTP/SSE
 *
 * Implements the Model Context Protocol transport layer.
 * Supports: initialize, tools/list, tools/call, resources/list, resources/read
 */

import { MCP_TOOLS, handleMcpTool } from "@/services/mcp/server";
import { prisma } from "@/lib/db";

// ============================================================
// JSON-RPC Types
// ============================================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

// ============================================================
// Server Info
// ============================================================

const SERVER_INFO = {
  name: "orbit-mcp-server",
  version: "1.0.0",
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
  },
  serverInfo: {
    name: "Orbit Testing Platform",
    version: "1.0.0",
  },
};

// ============================================================
// Method Handlers
// ============================================================

function handleInitialize(): unknown {
  return SERVER_INFO;
}

function handleToolsList(): unknown {
  return {
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
}

async function handleToolsCall(
  params: Record<string, unknown> | undefined,
  workspaceId: string
): Promise<unknown> {
  if (!params?.name || typeof params.name !== "string") {
    throw { code: INVALID_PARAMS, message: "Missing required param: name" };
  }

  const toolName = params.name;
  const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

  const tool = MCP_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    throw { code: METHOD_NOT_FOUND, message: `Unknown tool: ${toolName}` };
  }

  // Verify project access if projectId is provided
  if (toolArgs.projectId && typeof toolArgs.projectId === "string") {
    const project = await prisma.project.findFirst({
      where: { id: toolArgs.projectId, workspaceId },
      select: { id: true },
    });
    if (!project) {
      throw {
        code: INVALID_PARAMS,
        message: "Project not found or not accessible",
      };
    }
  }

  const result = await handleMcpTool(toolName, toolArgs);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

async function handleResourcesList(
  workspaceId: string
): Promise<unknown> {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true, name: true, slug: true },
    take: 50,
  });

  const resources = projects.map((p) => ({
    uri: `orbit://projects/${p.id}`,
    name: p.name,
    description: `Project: ${p.name}`,
    mimeType: "application/json",
  }));

  // Add recent runs as resources
  const recentRuns = await prisma.testRun.findMany({
    where: {
      project: { workspaceId },
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: {
      id: true,
      mode: true,
      project: { select: { name: true } },
      completedAt: true,
    },
  });

  for (const run of recentRuns) {
    resources.push({
      uri: `orbit://runs/${run.id}`,
      name: `Run ${run.id.slice(0, 8)} (${run.project.name})`,
      description: `${run.mode} run completed ${run.completedAt?.toISOString() ?? "unknown"}`,
      mimeType: "application/json",
    });
  }

  return { resources };
}

async function handleResourcesRead(
  params: Record<string, unknown> | undefined,
  workspaceId: string
): Promise<unknown> {
  if (!params?.uri || typeof params.uri !== "string") {
    throw { code: INVALID_PARAMS, message: "Missing required param: uri" };
  }

  const uri = params.uri;

  // Parse orbit://projects/{id}
  const projectMatch = uri.match(/^orbit:\/\/projects\/(.+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1];
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        repoUrl: true,
        healthStatus: true,
        lastRunAt: true,
        framework: true,
      },
    });
    if (!project) {
      throw { code: INVALID_PARAMS, message: "Project not found" };
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(project, null, 2),
        },
      ],
    };
  }

  // Parse orbit://runs/{id}
  const runMatch = uri.match(/^orbit:\/\/runs\/(.+)$/);
  if (runMatch) {
    const runId = runMatch[1];
    const run = await prisma.testRun.findFirst({
      where: { id: runId, project: { workspaceId } },
      select: {
        id: true,
        status: true,
        mode: true,
        trigger: true,
        totalTests: true,
        passed: true,
        failed: true,
        flaky: true,
        summary: true,
        completedAt: true,
      },
    });
    if (!run) {
      throw { code: INVALID_PARAMS, message: "Run not found" };
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(run, null, 2),
        },
      ],
    };
  }

  throw { code: INVALID_PARAMS, message: `Unsupported resource URI: ${uri}` };
}

// ============================================================
// Main Handler
// ============================================================

export async function handleMCPRequest(
  request: JsonRpcRequest,
  workspaceId: string
): Promise<JsonRpcResponse> {
  if (request.jsonrpc !== "2.0") {
    return errorResponse(request.id, INVALID_REQUEST, "Invalid JSON-RPC version");
  }

  try {
    let result: unknown;

    switch (request.method) {
      case "initialize":
        result = handleInitialize();
        break;
      case "tools/list":
        result = handleToolsList();
        break;
      case "tools/call":
        result = await handleToolsCall(request.params, workspaceId);
        break;
      case "resources/list":
        result = await handleResourcesList(workspaceId);
        break;
      case "resources/read":
        result = await handleResourcesRead(request.params, workspaceId);
        break;
      default:
        return errorResponse(
          request.id,
          METHOD_NOT_FOUND,
          `Method not found: ${request.method}`
        );
    }

    return { jsonrpc: "2.0", id: request.id, result };
  } catch (err) {
    if (isJsonRpcError(err)) {
      return errorResponse(request.id, err.code, err.message, err.data);
    }
    console.error("[mcp-transport] Unhandled error:", err);
    return errorResponse(
      request.id,
      INTERNAL_ERROR,
      err instanceof Error ? err.message : "Internal error"
    );
  }
}

// ============================================================
// Helpers
// ============================================================

function errorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function isJsonRpcError(err: unknown): err is JsonRpcError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    typeof (err as JsonRpcError).code === "number"
  );
}

/**
 * Parse a raw string into a JsonRpcRequest, throwing on invalid input.
 */
export function parseJsonRpcRequest(raw: string): JsonRpcRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw { code: PARSE_ERROR, message: "Parse error: invalid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw { code: INVALID_REQUEST, message: "Request must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.jsonrpc !== "2.0") {
    throw { code: INVALID_REQUEST, message: "jsonrpc must be \"2.0\"" };
  }

  if (obj.id === undefined || obj.id === null) {
    throw { code: INVALID_REQUEST, message: "id is required" };
  }

  if (typeof obj.method !== "string") {
    throw { code: INVALID_REQUEST, message: "method must be a string" };
  }

  return {
    jsonrpc: "2.0",
    id: obj.id as string | number,
    method: obj.method,
    params: obj.params as Record<string, unknown> | undefined,
  };
}
