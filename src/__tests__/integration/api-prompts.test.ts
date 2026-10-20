import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRouteAuth } from "../helpers/route-auth";

const mockPrisma = vi.hoisted(() => ({
  promptVersion: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
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

// GET/DELETE run through route(); PUT still calls requirePermission (mocked above)
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

vi.mock("@/agents/prompts/operator-layer", () => ({
  getOperatorPrompt: vi.fn().mockReturnValue("[OPERATOR]"),
}));

vi.mock("@/agents/prompts/user-layer", () => ({
  buildUserLayer: vi.fn().mockImplementation((input) => {
    if (input?.workspaceConfig?.customPrompt) {
      return `[USER: ${input.workspaceConfig.customPrompt}]`;
    }
    return "";
  }),
}));

vi.mock("@/agents/prompts/default-prompts", () => ({
  DEFAULT_USER_PROMPTS: {
    analyst: "Default analyst prompt",
    planner: "Default planner prompt",
    executor: "Default executor prompt",
    reporter: "Default reporter prompt",
    auditor: "Default auditor prompt",
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
      const msg = error instanceof Error ? error.message : "Internal error";
      return NextResponse.json(
        { success: false, error: { message: msg, code: "INTERNAL_ERROR" } },
        { status: 500 }
      );
    },
  };
});

import { GET as listPrompts } from "@/app/api/workspaces/[workspaceId]/prompts/route";
import {
  GET as getPrompt,
  PUT as updatePrompt,
  DELETE as deletePrompt,
} from "@/app/api/workspaces/[workspaceId]/prompts/[agentPhase]/route";

const listParams = { params: Promise.resolve({ workspaceId: "ws-1" }) };
const phaseParams = (phase: string) => ({
  params: Promise.resolve({ workspaceId: "ws-1", agentPhase: phase }),
});

describe("prompts API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouteAuth();
  });

  describe("GET /prompts (list)", () => {
    it("returns all 5 phases with version info", async () => {
      mockPrisma.promptVersion.findMany.mockResolvedValueOnce([
        { agentPhase: "analyst", isActive: true, version: 3, createdAt: new Date("2024-01-10") },
        { agentPhase: "analyst", isActive: false, version: 2, createdAt: new Date("2024-01-05") },
        { agentPhase: "analyst", isActive: false, version: 1, createdAt: new Date("2024-01-01") },
        { agentPhase: "planner", isActive: true, version: 1, createdAt: new Date("2024-01-02") },
      ]);

      const request = new NextRequest("http://localhost/api/test");
      const response = await listPrompts(request, listParams);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(5);

      const analyst = json.data.find((p: { agentPhase: string }) => p.agentPhase === "analyst");
      expect(analyst.hasCustomPrompt).toBe(true);
      expect(analyst.activeVersion).toBe(3);
      expect(analyst.versionCount).toBe(3);

      const planner = json.data.find((p: { agentPhase: string }) => p.agentPhase === "planner");
      expect(planner.hasCustomPrompt).toBe(true);
      expect(planner.versionCount).toBe(1);

      const executor = json.data.find((p: { agentPhase: string }) => p.agentPhase === "executor");
      expect(executor.hasCustomPrompt).toBe(false);
      expect(executor.activeVersion).toBeNull();
      expect(executor.versionCount).toBe(0);
    });

    it("handles workspace with no custom prompts", async () => {
      mockPrisma.promptVersion.findMany.mockResolvedValueOnce([]);

      const request = new NextRequest("http://localhost/api/test");
      const response = await listPrompts(request, listParams);
      const json = await response.json();

      expect(json.data).toHaveLength(5);
      expect(json.data.every((p: { hasCustomPrompt: boolean }) => !p.hasCustomPrompt)).toBe(true);
    });
  });

  describe("GET /prompts/[agentPhase]", () => {
    it("returns custom prompt when active version exists", async () => {
      mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
        content: "My custom analyst prompt",
        version: 2,
        createdAt: new Date("2024-01-10"),
        createdBy: { id: "user-1", name: "Test User", email: "test@test.com" },
      });

      const request = new NextRequest("http://localhost/api/test");
      const response = await getPrompt(request, phaseParams("analyst"));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.customPrompt).toBe("My custom analyst prompt");
      expect(json.data.defaultPrompt).toBe("Default analyst prompt");
      expect(json.data.version).toBe(2);
      expect(json.data.assembledPreview).toContain("[OPERATOR]");
      expect(json.data.estimatedTokens).toBeGreaterThan(0);
    });

    it("returns default prompt when no custom version exists", async () => {
      mockPrisma.promptVersion.findFirst.mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost/api/test");
      const response = await getPrompt(request, phaseParams("planner"));
      const json = await response.json();

      expect(json.data.customPrompt).toBeNull();
      expect(json.data.defaultPrompt).toBe("Default planner prompt");
      expect(json.data.version).toBeNull();
    });

    it("returns 400 for invalid phase", async () => {
      const request = new NextRequest("http://localhost/api/test");
      const response = await getPrompt(request, phaseParams("invalid"));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PUT /prompts/[agentPhase]", () => {
    it("creates new version and deactivates old", async () => {
      mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({ version: 2 });

      const newVersion = {
        id: "pv-3",
        workspaceId: "ws-1",
        agentPhase: "analyst",
        version: 3,
        content: "Updated prompt",
        isActive: true,
        createdById: "user-1",
        createdAt: new Date(),
        createdBy: { id: "user-1", name: "Test", email: "t@t.com" },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          promptVersion: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue(newVersion),
          },
        });
      });

      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ content: "Updated prompt", changelog: "Improved tone" }),
      });

      const response = await updatePrompt(request, phaseParams("analyst"));
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
    });

    it("returns 400 when content is empty", async () => {
      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ content: "" }),
      });

      const response = await updatePrompt(request, phaseParams("analyst"));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toContain("cannot be empty");
    });

    it("returns 400 when content exceeds max length", async () => {
      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ content: "x".repeat(50001) }),
      });

      const response = await updatePrompt(request, phaseParams("analyst"));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toContain("exceeds maximum length");
    });

    it("returns 400 for invalid phase", async () => {
      const request = new NextRequest("http://localhost/api/test", {
        method: "PUT",
        body: JSON.stringify({ content: "valid content" }),
      });

      const response = await updatePrompt(request, phaseParams("invalid"));
      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /prompts/[agentPhase]", () => {
    it("reverts to default by deactivating all versions", async () => {
      mockPrisma.promptVersion.updateMany.mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest("http://localhost/api/test", { method: "DELETE" });
      const response = await deletePrompt(request, phaseParams("analyst"));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.reverted).toBe(true);
      expect(json.data.agentPhase).toBe("analyst");

      expect(mockPrisma.promptVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: "ws-1",
            agentPhase: "analyst",
            isActive: true,
          }),
          data: { isActive: false },
        })
      );
    });

    it("returns 400 for invalid phase", async () => {
      const request = new NextRequest("http://localhost/api/test", { method: "DELETE" });
      const response = await deletePrompt(request, phaseParams("bogus"));
      expect(response.status).toBe(400);
    });
  });
});
