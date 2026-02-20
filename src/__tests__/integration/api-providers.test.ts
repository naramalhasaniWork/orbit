import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = vi.hoisted(() => ({
  providerConfig: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    session: { user: { id: "user-1", name: "Test User" } },
    workspaceId: "ws-1",
    role: "owner",
    memberId: "member-1",
  }),
}));

vi.mock("@/lib/vault", () => ({
  encrypt: vi.fn().mockReturnValue({ encrypted: "enc123", iv: "iv456" }),
  decrypt: vi.fn().mockReturnValue("sk-decrypted-key"),
}));

vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    apiSuccess: (data: unknown, status = 200) =>
      NextResponse.json({ success: true, data }, { status }),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Internal error";
      return NextResponse.json(
        { success: false, error: { message: msg, code: "INTERNAL_ERROR" } },
        { status: 500 }
      );
    },
  };
});

import { GET, POST } from "@/app/api/workspaces/[workspaceId]/providers/route";
import { PUT, DELETE } from "@/app/api/workspaces/[workspaceId]/providers/[provider]/route";

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const defaultParams = { params: Promise.resolve({ workspaceId: "ws-1" }) };
const providerParams = { params: Promise.resolve({ workspaceId: "ws-1", provider: "anthropic" }) };

describe("provider config API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /providers", () => {
    it("returns providers with masked API keys", async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValueOnce([
        {
          id: "pc-1",
          provider: "anthropic",
          displayName: "Anthropic",
          isActive: true,
          isDefault: true,
          baseUrl: null,
          settings: null,
          apiKeyEncrypted: "iv456:enc123abcdef",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const response = await GET(makeRequest(), defaultParams);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].provider).toBe("anthropic");
      expect(json.data[0].apiKeyConfigured).toBe(true);
      expect(json.data[0].apiKeyHint).toMatch(/^••••••••/);
      // Raw encrypted key should not be exposed
      expect(json.data[0].apiKeyEncrypted).toBeUndefined();
    });

    it("returns empty array when no providers configured", async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValueOnce([]);

      const response = await GET(makeRequest(), defaultParams);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });
  });

  describe("POST /providers", () => {
    it("creates a new provider config with encrypted key", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce(null);
      mockPrisma.providerConfig.create.mockResolvedValueOnce({
        id: "pc-new",
        provider: "openai",
        displayName: "OpenAI",
        isActive: true,
        isDefault: false,
        baseUrl: null,
        settings: null,
        apiKeyEncrypted: "iv456:enc123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = makeRequest({
        provider: "openai",
        displayName: "OpenAI",
        apiKey: "sk-test-key",
      });

      const response = await POST(request, defaultParams);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.provider).toBe("openai");
      expect(json.data.apiKeyConfigured).toBe(true);
    });

    it("returns 400 for invalid provider", async () => {
      const request = makeRequest({ provider: "invalid-provider" });
      const response = await POST(request, defaultParams);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Invalid provider");
    });

    it("returns 409 when provider already exists", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce({
        id: "existing",
        provider: "anthropic",
      });

      const request = makeRequest({ provider: "anthropic", apiKey: "sk-key" });
      const response = await POST(request, defaultParams);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("CONFLICT");
    });

    it("creates audit log on successful creation", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce(null);
      mockPrisma.providerConfig.create.mockResolvedValueOnce({
        id: "pc-new",
        provider: "openrouter",
        displayName: null,
        isActive: true,
        isDefault: false,
        baseUrl: null,
        settings: null,
        apiKeyEncrypted: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = makeRequest({ provider: "openrouter" });
      await POST(request, defaultParams);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "provider.create",
            resourceType: "ProviderConfig",
          }),
        })
      );
    });
  });

  describe("PUT /providers/[provider]", () => {
    it("updates provider and re-encrypts API key", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
      });
      mockPrisma.providerConfig.update.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
        displayName: "Updated Name",
        isActive: true,
        isDefault: false,
        baseUrl: null,
        settings: null,
        apiKeyEncrypted: "iv456:enc123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({
          displayName: "Updated Name",
          apiKey: "sk-new-key",
        }),
      });

      const response = await PUT(request, providerParams);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.displayName).toBe("Updated Name");
      expect(json.data.apiKeyConfigured).toBe(true);
    });

    it("returns 404 when provider not found", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ displayName: "x" }),
      });

      const response = await PUT(request, providerParams);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("clears API key when empty string provided", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
      });
      mockPrisma.providerConfig.update.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
        displayName: null,
        isActive: true,
        isDefault: false,
        baseUrl: null,
        settings: null,
        apiKeyEncrypted: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ apiKey: "" }),
      });

      const response = await PUT(request, providerParams);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.apiKeyConfigured).toBe(false);
    });

    it("unsets other defaults when setting isDefault", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
      });
      mockPrisma.providerConfig.update.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
        displayName: null,
        isActive: true,
        isDefault: true,
        baseUrl: null,
        settings: null,
        apiKeyEncrypted: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ isDefault: true }),
      });

      await PUT(request, providerParams);

      expect(mockPrisma.providerConfig.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDefault: true }),
          data: { isDefault: false },
        })
      );
    });
  });

  describe("DELETE /providers/[provider]", () => {
    it("deletes provider and creates audit log", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce({
        id: "pc-1",
        provider: "anthropic",
      });
      mockPrisma.providerConfig.delete.mockResolvedValueOnce({});

      const request = new NextRequest("http://localhost/api/test", { method: "DELETE" });
      const response = await DELETE(request, providerParams);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "provider.delete" }),
        })
      );
    });

    it("returns 404 when provider not found", async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost/api/test", { method: "DELETE" });
      const response = await DELETE(request, providerParams);
      const json = await response.json();

      expect(response.status).toBe(404);
    });
  });
});
