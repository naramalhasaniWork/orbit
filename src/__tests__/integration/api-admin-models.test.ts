import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = vi.hoisted(() => ({
  modelRegistry: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  globalModelPolicy: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  tokenUsage: {
    groupBy: vi.fn(),
  },
}));

const adminState = vi.hoisted(() => ({ isSuperAdmin: true }));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");

  class AuthError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = "AuthError";
    }
  }

  return {
    requireSuperAdmin: vi.fn().mockImplementation(async () => {
      if (!adminState.isSuperAdmin) {
        throw new AuthError("Super admin access required", "FORBIDDEN", 403);
      }
      return { user: { id: "admin-1" }, userRole: "super_admin" };
    }),
    apiSuccess: (data: unknown, status = 200) =>
      NextResponse.json({ success: true, data }, { status }),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (error: unknown) => {
      if (error instanceof Error && "status" in error) {
        const e = error as Error & { code: string; status: number };
        return NextResponse.json(
          { success: false, error: { message: e.message, code: e.code } },
          { status: e.status }
        );
      }
      return NextResponse.json(
        { success: false, error: { message: "Internal error", code: "INTERNAL_ERROR" } },
        { status: 500 }
      );
    },
  };
});

import { GET, POST } from "@/app/api/admin/models/route";
import { POST as syncModels } from "@/app/api/admin/models/sync/route";
import { PUT as updatePolicy } from "@/app/api/admin/models/[modelId]/route";

describe("admin models API", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    adminState.isSuperAdmin = true;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("GET /admin/models", () => {
    it("returns paginated models with policies and usage", async () => {
      mockPrisma.modelRegistry.findMany
        .mockResolvedValueOnce([
          {
            id: "mr-1",
            provider: "anthropic",
            modelId: "claude-3-haiku",
            displayName: "Claude 3 Haiku",
            contextWindow: 200000,
            inputCostPer1M: 0.8,
            outputCostPer1M: 4,
          },
        ])
        .mockResolvedValueOnce([{ provider: "anthropic" }, { provider: "openai" }]);

      mockPrisma.modelRegistry.count.mockResolvedValueOnce(1);

      mockPrisma.globalModelPolicy.findMany.mockResolvedValueOnce([
        {
          modelId: "claude-3-haiku",
          provider: "anthropic",
          isAllowed: true,
          requiredTier: "starter",
        },
      ]);

      mockPrisma.tokenUsage.groupBy.mockResolvedValueOnce([
        {
          model: "claude-3-haiku",
          _sum: { inputTokens: 5000, outputTokens: 2000 },
          _count: 10,
        },
      ]);

      const request = new NextRequest("http://localhost/api/admin/models?page=1&limit=50");
      const response = await GET(request);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.models).toHaveLength(1);
      expect(json.data.models[0].policy).not.toBeNull();
      expect(json.data.models[0].policy.requiredTier).toBe("starter");
      expect(json.data.models[0].usage.totalTokens).toBe(7000);
      expect(json.data.models[0].usage.calls).toBe(10);
      expect(json.data.total).toBe(1);
      expect(json.data.providers).toEqual(["anthropic", "openai"]);
    });

    it("rejects non-admin users", async () => {
      adminState.isSuperAdmin = false;

      const request = new NextRequest("http://localhost/api/admin/models");
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
    });

    it("supports search filtering", async () => {
      mockPrisma.modelRegistry.findMany.mockResolvedValue([]);
      mockPrisma.modelRegistry.count.mockResolvedValueOnce(0);
      mockPrisma.globalModelPolicy.findMany.mockResolvedValueOnce([]);
      mockPrisma.tokenUsage.groupBy.mockResolvedValueOnce([]);

      const request = new NextRequest(
        "http://localhost/api/admin/models?search=haiku&provider=anthropic"
      );
      await GET(request);

      const findManyCall = mockPrisma.modelRegistry.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.provider).toBe("anthropic");
    });
  });

  describe("POST /admin/models (create policy)", () => {
    it("creates a model policy", async () => {
      mockPrisma.globalModelPolicy.upsert.mockResolvedValueOnce({
        id: "gmp-1",
        modelId: "gpt-4o",
        provider: "openai",
        isAllowed: true,
        requiredTier: "professional",
      });

      const request = new NextRequest("http://localhost/api/admin/models", {
        method: "POST",
        body: JSON.stringify({
          modelId: "gpt-4o",
          provider: "openai",
          isAllowed: true,
          requiredTier: "professional",
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.modelId).toBe("gpt-4o");
    });

    it("returns 400 for invalid body", async () => {
      const request = new NextRequest("http://localhost/api/admin/models", {
        method: "POST",
        body: JSON.stringify({ modelId: "", isAllowed: "not a bool" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("rejects non-admin users", async () => {
      adminState.isSuperAdmin = false;

      const request = new NextRequest("http://localhost/api/admin/models", {
        method: "POST",
        body: JSON.stringify({
          modelId: "test",
          provider: "test",
          isAllowed: true,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(403);
    });
  });

  describe("PUT /admin/models/[modelId] (update policy)", () => {
    it("updates an existing policy", async () => {
      mockPrisma.globalModelPolicy.upsert.mockResolvedValueOnce({
        id: "gmp-1",
        modelId: "gpt-4o",
        provider: "openai",
        isAllowed: false,
      });

      const request = new NextRequest("http://localhost/api/admin/models/gpt-4o", {
        method: "PUT",
        body: JSON.stringify({ provider: "openai", isAllowed: false }),
      });

      const response = await updatePolicy(request, {
        params: Promise.resolve({ modelId: "gpt-4o" }),
      });
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.isAllowed).toBe(false);
    });

    it("returns 400 for missing provider", async () => {
      const request = new NextRequest("http://localhost/api/admin/models/gpt-4o", {
        method: "PUT",
        body: JSON.stringify({ isAllowed: true }),
      });

      const response = await updatePolicy(request, {
        params: Promise.resolve({ modelId: "gpt-4o" }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("POST /admin/models/sync", () => {
    it("syncs models from OpenRouter", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              id: "anthropic/claude-3-haiku",
              name: "Claude 3 Haiku",
              context_length: 200000,
              pricing: { prompt: "0.00000025", completion: "0.00000125" },
            },
            {
              id: "openai/gpt-4o",
              name: "GPT-4o",
              context_length: 128000,
              pricing: { prompt: "0.000005", completion: "0.000015" },
            },
          ],
        }),
      });

      mockPrisma.modelRegistry.findUnique.mockResolvedValue(null);
      mockPrisma.modelRegistry.create.mockResolvedValue({});

      const response = await syncModels();
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.total).toBe(2);
      expect(json.data.created).toBe(2);
      expect(json.data.updated).toBe(0);
    });

    it("updates existing models during sync", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              id: "openai/gpt-4o",
              name: "GPT-4o Updated",
              context_length: 128000,
              pricing: { prompt: "0.000003", completion: "0.00001" },
            },
          ],
        }),
      });

      mockPrisma.modelRegistry.findUnique.mockResolvedValueOnce({
        id: "existing-id",
        modelId: "openai/gpt-4o",
      });
      mockPrisma.modelRegistry.update.mockResolvedValue({});

      const response = await syncModels();
      const json = await response.json();

      expect(json.data.created).toBe(0);
      expect(json.data.updated).toBe(1);
    });

    it("returns 502 when OpenRouter API fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const response = await syncModels();
      const json = await response.json();

      expect(response.status).toBe(502);
      expect(json.error.code).toBe("OPENROUTER_ERROR");
    });

    it("returns 502 when response is not array", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: "not an array" }),
      });

      const response = await syncModels();
      const json = await response.json();

      expect(response.status).toBe(502);
    });
  });
});
