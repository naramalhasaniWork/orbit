import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-key";
import {
  handleMCPRequest,
  parseJsonRpcRequest,
} from "@/services/mcp/transport";
import type { JsonRpcResponse } from "@/services/mcp/transport";

/**
 * MCP-compatible endpoint following JSON-RPC 2.0 spec.
 *
 * POST /api/mcp — JSON-RPC request/response
 * GET  /api/mcp — SSE stream for server-initiated notifications
 *
 * Authentication: Bearer token (workspace API key).
 */

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) {
    if (auth.status !== 401) return auth;
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Invalid or missing API key" },
      },
      { status: 401 }
    );
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return jsonRpcError(null, -32700, "Could not read request body");
  }

  let rpcRequest;
  try {
    rpcRequest = parseJsonRpcRequest(raw);
  } catch (err) {
    const e = err as { code: number; message: string };
    return jsonRpcError(null, e.code ?? -32700, e.message ?? "Parse error");
  }

  try {
    const response = await handleMCPRequest(rpcRequest, auth.workspaceId);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[mcp] Request failed:", error);
    return jsonRpcError(
      rpcRequest.id,
      -32603,
      error instanceof Error ? error.message : "Internal error"
    );
  }
}

/**
 * SSE endpoint for server-initiated notifications.
 * Clients connect here to receive run progress updates, completion events, etc.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) {
    return auth.status === 401 ? new NextResponse("Unauthorized", { status: 401 }) : auth;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const connectEvent = formatSSE("connected", {
        server: "orbit-mcp-server",
        version: "1.0.0",
        workspaceId: auth.workspaceId,
      });
      controller.enqueue(encoder.encode(connectEvent));

      // Send keepalive pings every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(formatSSE("ping", { ts: Date.now() })));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      // Clean up on close
      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ============================================================
// Helpers
// ============================================================

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string
): NextResponse {
  const body: JsonRpcResponse = {
    jsonrpc: "2.0",
    id: id ?? 0,
    error: { code, message },
  };
  return NextResponse.json(body, { status: code === -32000 ? 401 : 200 });
}

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
