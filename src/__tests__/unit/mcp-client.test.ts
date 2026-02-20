import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  mcpConnection: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/vault", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted-api-key"),
}));

import {
  discoverTools,
  callTool,
  testConnection,
  disconnectFromPool,
} from "@/services/mcp/client";

const MOCK_CONNECTION = {
  id: "conn-1",
  name: "Test MCP Server",
  serverUrl: "https://mcp.example.com/rpc",
  apiKeyEncrypted: "encrypted-key",
  apiKeyIv: "iv-value",
  headers: null,
  isActive: true,
  toolsDiscovered: null,
  lastConnectedAt: null,
};

function mockJsonRpcResponse(result: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      jsonrpc: "2.0",
      id: "test-id",
      result,
    }),
  } as unknown as Response;
}

function mockJsonRpcError(code: number, message: string): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      jsonrpc: "2.0",
      id: "test-id",
      error: { code, message },
    }),
  } as unknown as Response;
}

describe("mcp client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    disconnectFromPool("conn-1");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("discoverTools", () => {
    it("sends initialize then tools/list and returns parsed tools", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      const initResponse = mockJsonRpcResponse({ capabilities: {} });
      const toolsResponse = mockJsonRpcResponse({
        tools: [
          {
            name: "search",
            description: "Search the web",
            inputSchema: { type: "object", properties: { query: { type: "string" } } },
          },
          {
            name: "calculate",
            description: "Do math",
            inputSchema: { type: "object", properties: { expression: { type: "string" } } },
          },
        ],
      });

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce(toolsResponse);

      const tools = await discoverTools("conn-1");

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("search");
      expect(tools[0].description).toBe("Search the web");
      expect(tools[0].connectionId).toBe("conn-1");
      expect(tools[0].connectionName).toBe("Test MCP Server");
      expect(tools[1].name).toBe("calculate");

      // Verify it updated the DB
      expect(mockPrisma.mcpConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conn-1" },
          data: expect.objectContaining({ lastConnectedAt: expect.any(Date) }),
        })
      );
    });

    it("returns empty array when server has no tools", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonRpcResponse({ capabilities: {} }))
        .mockResolvedValueOnce(mockJsonRpcResponse({ tools: [] }));

      const tools = await discoverTools("conn-1");
      expect(tools).toHaveLength(0);
    });

    it("handles missing tools field in response", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonRpcResponse({ capabilities: {} }))
        .mockResolvedValueOnce(mockJsonRpcResponse({}));

      const tools = await discoverTools("conn-1");
      expect(tools).toHaveLength(0);
    });

    it("throws on JSON-RPC error response", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonRpcError(-32600, "Invalid request"));

      await expect(discoverTools("conn-1")).rejects.toThrow(
        "MCP JSON-RPC error [-32600]: Invalid request"
      );
    });

    it("throws on HTTP error from server", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(discoverTools("conn-1")).rejects.toThrow(
        "MCP server returned HTTP 503"
      );
    });
  });

  describe("callTool", () => {
    it("sends correct JSON-RPC tools/call request", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        mockJsonRpcResponse({
          content: [{ type: "text", text: "Result from tool" }],
        })
      );

      const result = await callTool("conn-1", "search", { query: "test" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe("Result from tool");

      // Verify the fetch body
      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.method).toBe("tools/call");
      expect(body.params.name).toBe("search");
      expect(body.params.arguments).toEqual({ query: "test" });
    });

    it("throws when connection is disabled", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce({
        ...MOCK_CONNECTION,
        isActive: false,
      });

      await expect(callTool("conn-1", "search", {})).rejects.toThrow(
        'MCP connection "Test MCP Server" is disabled'
      );
    });

    it("wraps raw result when content field is missing", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        mockJsonRpcResponse({ someData: "raw" })
      );

      const result = await callTool("conn-1", "search", {});
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("someData");
    });

    it("handles JSON-RPC error in tool call", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        mockJsonRpcError(-32601, "Method not found")
      );

      await expect(callTool("conn-1", "nonexistent", {})).rejects.toThrow(
        "MCP JSON-RPC error [-32601]: Method not found"
      );
    });
  });

  describe("testConnection", () => {
    it("returns ok:true when discover succeeds", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockJsonRpcResponse({ capabilities: {} }))
        .mockResolvedValueOnce(
          mockJsonRpcResponse({
            tools: [{ name: "t1", description: "d", inputSchema: {} }],
          })
        );

      const result = await testConnection("conn-1");
      expect(result.ok).toBe(true);
      expect(result.toolCount).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it("returns ok:false with error message on failure", async () => {
      mockPrisma.mcpConnection.findUniqueOrThrow.mockResolvedValueOnce(MOCK_CONNECTION);

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await testConnection("conn-1");
      expect(result.ok).toBe(false);
      expect(result.toolCount).toBe(0);
      expect(result.error).toContain("ECONNREFUSED");
    });
  });

  describe("disconnectFromPool", () => {
    it("removes connection from pool without error", () => {
      expect(() => disconnectFromPool("conn-1")).not.toThrow();
      expect(() => disconnectFromPool("nonexistent")).not.toThrow();
    });
  });
});
