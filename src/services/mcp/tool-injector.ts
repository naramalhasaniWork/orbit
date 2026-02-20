/**
 * MCP Tool Injector — aggregates tools from all workspace MCP connections
 * and provides prompt formatting and tool call routing for agents.
 */

import { prisma } from "@/lib/db";
import { callTool, type McpToolDefinition } from "@/services/mcp/client";
import { writeAuditLog } from "@/lib/auth/audit";

// ============================================================
// Types
// ============================================================

interface ToolCallResult {
  success: boolean;
  output: string;
  connectionName: string;
}

// Rate limiting per run
const runToolCallCounts = new Map<string, number>();
const MAX_TOOL_CALLS_PER_RUN = 50;

// ============================================================
// Public API
// ============================================================

/**
 * Get all discovered tools from active MCP connections in a workspace.
 */
export async function getWorkspaceMcpTools(
  workspaceId: string
): Promise<McpToolDefinition[]> {
  const connections = await prisma.mcpConnection.findMany({
    where: { workspaceId, isActive: true },
    select: {
      id: true,
      name: true,
      toolsDiscovered: true,
    },
  });

  const tools: McpToolDefinition[] = [];

  for (const conn of connections) {
    const discovered = conn.toolsDiscovered as McpToolDefinition[] | null;
    if (!discovered || !Array.isArray(discovered)) continue;

    for (const tool of discovered) {
      tools.push({
        ...tool,
        connectionId: conn.id,
        connectionName: conn.name,
      });
    }
  }

  return tools;
}

/**
 * Format MCP tools for injection into agent system prompts.
 * Returns an empty string if no tools are available.
 */
export function formatToolsForPrompt(tools: McpToolDefinition[]): string {
  if (tools.length === 0) return "";

  const toolDescriptions = tools.map((t) => {
    const params = t.inputSchema?.properties
      ? Object.entries(t.inputSchema.properties as Record<string, { type?: string; description?: string }>)
          .map(([name, schema]) => `    - ${name} (${schema.type ?? "unknown"}): ${schema.description ?? ""}`)
          .join("\n")
      : "    (no parameters)";

    return `- **${t.name}** [${t.connectionName}]: ${t.description}\n  Parameters:\n${params}`;
  }).join("\n\n");

  return `## External MCP Tools Available
The following tools are available from connected MCP servers. You can call them by outputting a tool_call action.

${toolDescriptions}

To call an external tool, include in your output:
{
  "action": "tool_call",
  "toolName": "<tool_name>",
  "toolArgs": { ... }
}`;
}

/**
 * Execute a tool call, routing it to the correct MCP connection.
 * Enforces rate limits and logs to audit trail.
 */
export async function executeToolCall(
  workspaceId: string,
  toolName: string,
  args: Record<string, unknown>,
  runId?: string
): Promise<ToolCallResult> {
  // Rate limit per run
  if (runId) {
    const count = runToolCallCounts.get(runId) ?? 0;
    if (count >= MAX_TOOL_CALLS_PER_RUN) {
      return {
        success: false,
        output: `Rate limit exceeded: maximum ${MAX_TOOL_CALLS_PER_RUN} tool calls per run`,
        connectionName: "unknown",
      };
    }
    runToolCallCounts.set(runId, count + 1);
  }

  // Find which connection owns this tool
  const tools = await getWorkspaceMcpTools(workspaceId);
  const tool = tools.find((t) => t.name === toolName);

  if (!tool) {
    return {
      success: false,
      output: `Tool not found: ${toolName}`,
      connectionName: "unknown",
    };
  }

  // Audit the tool call
  await writeAuditLog({
    workspaceId,
    action: "mcp_connection.tool_call",
    resourceType: "mcp_connection",
    resourceId: tool.connectionId,
    metadata: { toolName, runId },
  });

  try {
    const result = await callTool(tool.connectionId, toolName, args);
    const output = result.content
      .map((c) => c.text)
      .join("\n");

    return {
      success: !result.isError,
      output,
      connectionName: tool.connectionName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `Tool call failed: ${message}`,
      connectionName: tool.connectionName,
    };
  }
}

/**
 * Clean up rate limit tracking for a completed run.
 */
export function clearRunToolCallCount(runId: string): void {
  runToolCallCounts.delete(runId);
}
