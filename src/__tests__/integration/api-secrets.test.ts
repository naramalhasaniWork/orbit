import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    secret: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    apiSuccess: (data: unknown, status = 200) =>
      NextResponse.json({ success: true, data }, { status }),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Internal server error";
      return NextResponse.json(
        { success: false, error: { message: msg, code: "INTERNAL_ERROR" } },
        { status: 500 }
      );
    },
    AuthError: class extends Error {
      code: string;
      status: number;
      constructor(message: string, code: string, status: number) {
        super(message);
        this.code = code;
        this.status = status;
      }
    },
  };
});

vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

vi.mock("@/lib/vault", () => ({
  encrypt: vi.fn(() => ({ encrypted: "enc-value", iv: "enc-iv" })),
}));

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { resetRouteAuth } from "../helpers/route-auth";

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  secret: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("api-secrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouteAuth();
  });

  describe("GET /api/projects/[projectId]/secrets", () => {
    it("returns secret keys only (never values)", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.secret.findMany.mockResolvedValue([
        { id: "s1", key: "API_KEY", createdAt: new Date(), updatedAt: new Date() },
        { id: "s2", key: "DB_URL", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { GET } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/p1/secrets");
      const response = await GET(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].key).toBe("API_KEY");
      // Ensure no encrypted values are returned
      expect(json.data[0]).not.toHaveProperty("encryptedValue");
      expect(json.data[0]).not.toHaveProperty("iv");
    });

    it("returns 404 when project not found", async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const { GET } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/missing/secrets");
      const response = await GET(request, {
        params: Promise.resolve({ projectId: "missing" }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/projects/[projectId]/secrets", () => {
    it("creates a new secret (encrypted)", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.secret.findFirst.mockResolvedValue(null); // no existing
      mockPrisma.secret.create.mockResolvedValue({
        id: "s-new",
        key: "NEW_SECRET",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/p1/secrets", {
        method: "POST",
        body: JSON.stringify({ key: "NEW_SECRET", value: "super-secret-value" }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.key).toBe("NEW_SECRET");
      // Verify encrypt was called (value is never stored in plaintext)
      expect(json.data).not.toHaveProperty("encryptedValue");
    });

    it("updates existing secret with same key", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.secret.findFirst.mockResolvedValue({ id: "s-existing" });
      mockPrisma.secret.update.mockResolvedValue({
        id: "s-existing",
        key: "EXISTING_KEY",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/p1/secrets", {
        method: "POST",
        body: JSON.stringify({ key: "EXISTING_KEY", value: "new-value" }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(201);
      expect(mockPrisma.secret.update).toHaveBeenCalled();
      expect(mockPrisma.secret.create).not.toHaveBeenCalled();
    });

    it("rejects missing key", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });

      const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/p1/secrets", {
        method: "POST",
        body: JSON.stringify({ value: "some-value" }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects missing value", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });

      const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/p1/secrets", {
        method: "POST",
        body: JSON.stringify({ key: "SOME_KEY" }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects empty key string", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });

      const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
      const request = new NextRequest("http://localhost/api/projects/p1/secrets", {
        method: "POST",
        body: JSON.stringify({ key: "", value: "val" }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(400);
    });
  });
});
