import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-key";
import { MCP_TOOLS, handleMcpTool } from "@/services/mcp/server";

/**
 * MCP-compatible endpoint for AI coding tool integrations.
 *
 * GET  /api/mcp — List available tools
 * POST /api/mcp — Execute a tool call
 */

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    name: "orbit-mcp-server",
    version: "1.0.0",
    description:
      "Orbit AI Testing Platform — query test results, plans, and system maps from your editor",
    tools: MCP_TOOLS,
  });
}

interface McpToolCallRequest {
  tool: string;
  arguments: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  let body: McpToolCallRequest;
  try {
    body = (await req.json()) as McpToolCallRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.tool) {
    return NextResponse.json(
      { error: "Missing 'tool' field" },
      { status: 400 }
    );
  }

  const validTools = MCP_TOOLS.map((t) => t.name);
  if (!validTools.includes(body.tool as (typeof validTools)[number])) {
    return NextResponse.json(
      { error: `Unknown tool: ${body.tool}`, availableTools: validTools },
      { status: 400 }
    );
  }

  try {
    const result = await handleMcpTool(body.tool, body.arguments ?? {});
    return NextResponse.json({ result });
  } catch (error) {
    console.error(`[mcp] Tool execution failed for ${body.tool}:`, error);
    return NextResponse.json(
      {
        error: "Tool execution failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
