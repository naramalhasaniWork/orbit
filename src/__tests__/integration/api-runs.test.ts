import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    testRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    environment: { findFirst: vi.fn() },
    testPlan: { findFirst: vi.fn() },
    testCase: { findMany: vi.fn(), count: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn(),
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

vi.mock("@/lib/auth/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/auth/tenant", () => ({
  TIER_LIMITS: {
    free: { projects: 3, runsPerMonth: 50 },
    starter: { projects: 10, runsPerMonth: 200 },
    professional: { projects: 50, runsPerMonth: 1000 },
    enterprise: { projects: 999, runsPerMonth: 9999 },
  },
}));

vi.mock("@/services/execution/environment-validator", () => ({
  getDefaultEnvironment: vi.fn(),
}));

vi.mock("@/lib/queue/queues", () => ({
  getExecutionQueue: vi.fn(() => ({ add: vi.fn() })),
}));

vi.mock("@/lib/websocket", () => ({
  emitRunStarted: vi.fn(),
  emitRunProgress: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/utils/api";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import { NextRequest } from "next/server";

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  testRun: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  environment: { findFirst: ReturnType<typeof vi.fn> };
  testPlan: { findFirst: ReturnType<typeof vi.fn> };
  testCase: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  workspace: { findUnique: ReturnType<typeof vi.fn> };
};
const mockRequireWorkspace = requireWorkspace as ReturnType<typeof vi.fn>;
const mockGetDefaultEnv = getDefaultEnvironment as ReturnType<typeof vi.fn>;

describe("api-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspace.mockResolvedValue({
      session: { user: { id: "user-1" }, workspaceId: "ws-1" },
      workspaceId: "ws-1",
    });
    // Default workspace and count mocks
    mockPrisma.workspace.findUnique.mockResolvedValue({ tier: "free", runLimit: 50 });
    mockPrisma.testRun.count.mockResolvedValue(0);
    mockPrisma.testCase.count.mockResolvedValue(2);
  });

  describe("GET /api/projects/[projectId]/runs", () => {
    it("returns runs for a project", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.testRun.findMany.mockResolvedValue([
        { id: "run-1", status: "completed", totalTests: 10 },
        { id: "run-2", status: "queued", totalTests: 0 },
      ]);

      const { GET } = await import("@/app/api/projects/[projectId]/runs/route");
      const request = new NextRequest("http://localhost/api/projects/p1/runs");
      const response = await GET(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
    });

    it("returns 404 when project not found", async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const { GET } = await import("@/app/api/projects/[projectId]/runs/route");
      const request = new NextRequest("http://localhost/api/projects/missing/runs");
      const response = await GET(request, {
        params: Promise.resolve({ projectId: "missing" }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/projects/[projectId]/runs", () => {
    it("creates a run with environment and test plan", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.environment.findFirst.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        defaultRunMode: null,
      });
      mockPrisma.testPlan.findFirst.mockResolvedValue({ id: "plan-1" });
      mockPrisma.testRun.create.mockResolvedValue({
        id: "run-new",
        status: "queued",
        mode: "full",
      });
      mockPrisma.testCase.count.mockResolvedValue(2);
      mockPrisma.testRun.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/projects/[projectId]/runs/route");
      const request = new NextRequest("http://localhost/api/projects/p1/runs", {
        method: "POST",
        body: JSON.stringify({
          environmentId: "env-1",
          testPlanId: "plan-1",
          mode: "full",
        }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(201);
    });

    it("blocks production environment", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.environment.findFirst.mockResolvedValue({
        id: "env-prod",
        type: "production",
        url: "https://prod.example.com",
        defaultRunMode: null,
      });

      const { POST } = await import("@/app/api/projects/[projectId]/runs/route");
      const request = new NextRequest("http://localhost/api/projects/p1/runs", {
        method: "POST",
        body: JSON.stringify({ environmentId: "env-prod" }),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(403);
    });

    it("returns 400 when no environment found", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockGetDefaultEnv.mockResolvedValue(null);

      const { POST } = await import("@/app/api/projects/[projectId]/runs/route");
      const request = new NextRequest("http://localhost/api/projects/p1/runs", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/projects/[projectId]/runs/[runId]/cancel", () => {
    it("cancels a queued run", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.testRun.findFirst.mockResolvedValue({
        id: "run-1",
        status: "queued",
        totalTests: 10,
        passed: 0,
        failed: 0,
      });
      mockPrisma.testRun.update.mockResolvedValue({
        id: "run-1",
        status: "cancelled",
      });

      const { POST } = await import(
        "@/app/api/projects/[projectId]/runs/[runId]/cancel/route"
      );
      const request = new NextRequest("http://localhost/api/projects/p1/runs/run-1/cancel");

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1", runId: "run-1" }),
      });
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.status).toBe("cancelled");
    });

    it("rejects cancellation of completed run", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.testRun.findFirst.mockResolvedValue({
        id: "run-1",
        status: "completed",
      });

      const { POST } = await import(
        "@/app/api/projects/[projectId]/runs/[runId]/cancel/route"
      );
      const request = new NextRequest("http://localhost/api/projects/p1/runs/run-1/cancel");

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1", runId: "run-1" }),
      });

      expect(response.status).toBe(409);
    });

    it("returns 404 for non-existent run", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.testRun.findFirst.mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/projects/[projectId]/runs/[runId]/cancel/route"
      );
      const request = new NextRequest("http://localhost/api/projects/p1/runs/missing/cancel");

      const response = await POST(request, {
        params: Promise.resolve({ projectId: "p1", runId: "missing" }),
      });

      expect(response.status).toBe(404);
    });
  });
});
