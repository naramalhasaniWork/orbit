import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const prisma = {
    project: { findFirst: vi.fn() },
    testRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    environment: { findFirst: vi.fn() },
    testPlan: { findFirst: vi.fn() },
    testCase: { findMany: vi.fn(), count: vi.fn() },
    workspace: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // launchers create runs inside a transaction that locks the workspace row
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return { prisma };
});

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

vi.mock("@/lib/auth/tenant", () => ({
  canConsume: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/services/execution/environment-validator", () => ({
  getDefaultEnvironment: vi.fn(),
}));

const queueAdd = vi.fn();
vi.mock("@/lib/queue/queues", () => ({
  getExecutionQueue: vi.fn(() => ({ add: queueAdd })),
}));

const requireQueueAvailable = vi.fn();
vi.mock("@/lib/queue/availability", () => ({
  WORKERS_UNAVAILABLE_MESSAGE: "Background workers unavailable: Redis is not reachable",
  requireQueueAvailable: () => requireQueueAvailable(),
  withQueueTimeout: <T>(op: Promise<T>) => op,
}));

vi.mock("@/lib/websocket", () => ({
  emitRunStarted: vi.fn(),
  emitRunProgress: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import { canConsume } from "@/lib/auth/tenant";
import { NextRequest } from "next/server";
import { resetRouteAuth } from "../helpers/route-auth";

const mockPrisma = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  testRun: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  environment: { findFirst: ReturnType<typeof vi.fn> };
  testPlan: { findFirst: ReturnType<typeof vi.fn> };
  testCase: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  workspace: { findUnique: ReturnType<typeof vi.fn> };
};
const mockGetDefaultEnv = getDefaultEnvironment as ReturnType<typeof vi.fn>;

describe("api-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouteAuth();
    // Default workspace and count mocks
    mockPrisma.workspace.findUnique.mockResolvedValue({ tier: "free" });
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

    function mockRunnableProject() {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.environment.findFirst.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        defaultRunMode: null,
      });
      mockPrisma.testPlan.findFirst.mockResolvedValue({ id: "plan-1" });
      mockPrisma.testRun.create.mockResolvedValue({ id: "run-new", status: "queued", mode: "full" });
      mockPrisma.testRun.update.mockResolvedValue({});
    }

    async function postRun() {
      const { POST } = await import("@/app/api/projects/[projectId]/runs/route");
      const request = new NextRequest("http://localhost/api/projects/p1/runs", {
        method: "POST",
        body: JSON.stringify({ environmentId: "env-1" }),
      });
      return POST(request, { params: Promise.resolve({ projectId: "p1" }) });
    }

    it("discards the run and returns 503 when the queue rejects the job", async () => {
      mockRunnableProject();
      queueAdd.mockRejectedValueOnce(new Error("ECONNREFUSED redis"));
      mockPrisma.testRun.delete.mockResolvedValue({});

      const response = await postRun();
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error.code).toBe("WORKERS_UNAVAILABLE");
      expect(json.error.message).toBe("Background workers unavailable: Redis is not reachable");
      expect(mockPrisma.testRun.delete).toHaveBeenCalledWith({ where: { id: "run-new" } });
    });

    it("does not create a run when the queue is unreachable", async () => {
      mockRunnableProject();
      requireQueueAvailable.mockRejectedValueOnce(new Error("Background workers unavailable: Redis is not reachable"));

      await postRun();

      expect(mockPrisma.testRun.create).not.toHaveBeenCalled();
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it("blocks the run with the allowance reason at zero credits", async () => {
      mockRunnableProject();
      (canConsume as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        allowed: false,
        code: "INSUFFICIENT_CREDITS",
        reason: "Credit balance is 0.",
      });

      const response = await postRun();
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error.code).toBe("INSUFFICIENT_CREDITS");
      expect(mockPrisma.testRun.create).not.toHaveBeenCalled();
    });

    it("re-checks the allowance inside the insert transaction and creates nothing when it is gone", async () => {
      mockRunnableProject();
      // Passes the fail-fast check, then a concurrent launch used the last slot
      (canConsume as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce({ allowed: false, code: "LIMIT_REACHED", reason: "Run limit reached." });

      const response = await postRun();

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("LIMIT_REACHED");
      expect(mockPrisma.testRun.create).not.toHaveBeenCalled();
      expect(queueAdd).not.toHaveBeenCalled();
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
      mockPrisma.testRun.findUnique.mockResolvedValue({
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
      mockPrisma.testRun.findUnique.mockResolvedValue({
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
      mockPrisma.testRun.findUnique.mockResolvedValue(null);

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
