import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    testRun: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    testResult: { groupBy: vi.fn() },
    workspace: { update: vi.fn() },
    systemMapNode: { count: vi.fn() },
    systemMapEdge: { count: vi.fn() },
    testPlan: { findFirst: vi.fn() },
    environment: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/websocket", () => ({
  emitRunStarted: vi.fn(),
  emitRunProgress: vi.fn(),
  emitRunCompleted: vi.fn(),
}));

vi.mock("@/services/orchestrator/context-manager", () => ({
  getProjectContext: vi.fn(),
}));

vi.mock("@/services/orchestrator/run-manager", () => ({
  createRun: vi.fn(),
  updateRunStatus: vi.fn(),
  updateRunStats: vi.fn(),
}));

// Mock dynamically imported modules
vi.mock("@/services/indexing/pipeline", () => ({
  runIndexingPipeline: vi.fn(),
}));

vi.mock("@/services/indexing/incremental", () => ({
  runIncrementalIndex: vi.fn(),
}));

vi.mock("@/services/planning/planner", () => ({
  generatePlan: vi.fn(),
}));

vi.mock("@/services/execution/runner", () => ({
  runTestSuite: vi.fn(),
}));

vi.mock("@/services/reporting/reporter", () => ({
  generateReport: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getProjectContext } from "@/services/orchestrator/context-manager";
import { createRun, updateRunStatus, updateRunStats } from "@/services/orchestrator/run-manager";
import { executePipeline } from "@/services/orchestrator/pipeline";

const mockPrisma = prisma as unknown as {
  project: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  testRun: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  testResult: { groupBy: ReturnType<typeof vi.fn> };
  workspace: { update: ReturnType<typeof vi.fn> };
};
const mockGetContext = getProjectContext as ReturnType<typeof vi.fn>;
const mockCreateRun = createRun as ReturnType<typeof vi.fn>;
const mockUpdateStatus = updateRunStatus as ReturnType<typeof vi.fn>;
const mockUpdateStats = updateRunStats as ReturnType<typeof vi.fn>;

describe("orchestrator pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes all pipeline stages in order for first run", async () => {
    const callOrder: string[] = [];

    mockGetContext.mockImplementation(async () => {
      callOrder.push("context");
      return {
        project: { id: "p1", defaultBranch: "main" },
        defaultEnvironment: { id: "env-1" },
        systemMapStats: { nodes: 0, edges: 0 },
        activePlan: null,
        lastRun: null,
      };
    });

    mockCreateRun.mockImplementation(async () => {
      callOrder.push("createRun");
      return { id: "run-1", projectId: "p1" };
    });

    mockUpdateStatus.mockImplementation(async (_id: string, status: string) => {
      callOrder.push(`status:${status}`);
      return {};
    });

    // Mock shouldReindex via prisma.project.findUnique
    mockPrisma.project.findUnique.mockResolvedValue({
      lastIndexedAt: null,
      workspaceId: "ws-1",
    });

    // Mock planner
    const { generatePlan } = await import("@/services/planning/planner");
    (generatePlan as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("planning");
      return {
        plan: { id: "plan-1" },
        tokensUsed: { input: 1000, output: 500 },
      };
    });

    mockPrisma.testRun.update.mockResolvedValue({});

    // Mock runner
    const { runTestSuite } = await import("@/services/execution/runner");
    (runTestSuite as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("execution");
    });

    // Mock reporter
    const { generateReport } = await import("@/services/reporting/reporter");
    (generateReport as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("reporting");
    });

    // Mock indexing
    const { runIndexingPipeline } = await import("@/services/indexing/pipeline");
    (runIndexingPipeline as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("indexing");
    });

    mockUpdateStats.mockResolvedValue({
      passed: 8,
      failed: 2,
      flaky: 1,
      totalTests: 11,
      durationMs: 5000,
    });

    mockPrisma.project.update.mockResolvedValue({});
    mockPrisma.workspace.update.mockResolvedValue({});

    const result = await executePipeline({
      projectId: "p1",
      trigger: "manual",
    });

    // Verify stages executed in correct order
    expect(callOrder).toEqual([
      "context",
      "createRun",
      "status:indexing",
      "indexing",
      "status:planning",
      "planning",
      "status:executing",
      "execution",
      "status:reporting",
      "reporting",
      "status:completed",
    ]);

    expect(result.status).toBe("completed");
    expect(result.runId).toBe("run-1");
    expect(result.passed).toBe(8);
    expect(result.failed).toBe(2);
  });

  it("returns failed status when pipeline throws", async () => {
    mockGetContext.mockResolvedValue({
      project: { id: "p1", defaultBranch: "main" },
      defaultEnvironment: { id: "env-1" },
      systemMapStats: { nodes: 0, edges: 0 },
      activePlan: { id: "plan-1", version: 1, testCaseCount: 5 },
      lastRun: { id: "prev-run", status: "completed", passed: 5, failed: 0 },
    });

    mockCreateRun.mockResolvedValue({ id: "run-fail", projectId: "p1" });
    mockUpdateStatus.mockResolvedValue({});

    // shouldReindex returns false (recently indexed)
    mockPrisma.project.findUnique
      .mockResolvedValueOnce({ lastIndexedAt: new Date(), workspaceId: "ws-1" })
      .mockResolvedValueOnce({ workspaceId: "ws-1" });

    // Planning throws an error
    mockUpdateStatus.mockImplementation(async (_id: string, status: string) => {
      if (status === "planning") {
        throw new Error("AI provider unavailable");
      }
      return {};
    });

    mockUpdateStats.mockResolvedValue({
      passed: 0,
      failed: 0,
      flaky: 0,
      totalTests: 0,
      durationMs: 0,
    });

    const result = await executePipeline({
      projectId: "p1",
      trigger: "manual",
    });

    expect(result.status).toBe("failed");
    expect(result.runId).toBe("run-fail");
  });

  it("tracks token usage through the pipeline", async () => {
    mockGetContext.mockResolvedValue({
      project: { id: "p1", defaultBranch: "main" },
      defaultEnvironment: { id: "env-1" },
      systemMapStats: { nodes: 5, edges: 3 },
      activePlan: null,
      lastRun: null,
    });

    mockCreateRun.mockResolvedValue({ id: "run-tok", projectId: "p1" });
    mockUpdateStatus.mockResolvedValue({});
    mockPrisma.project.findUnique.mockResolvedValue({
      lastIndexedAt: new Date(),
      workspaceId: "ws-1",
    });

    const { generatePlan } = await import("@/services/planning/planner");
    (generatePlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: { id: "plan-1" },
      tokensUsed: { input: 50000, output: 10000 },
    });

    mockPrisma.testRun.update.mockResolvedValue({});

    const { runTestSuite } = await import("@/services/execution/runner");
    (runTestSuite as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { generateReport } = await import("@/services/reporting/reporter");
    (generateReport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    mockUpdateStats.mockResolvedValue({
      passed: 5,
      failed: 0,
      flaky: 0,
      totalTests: 5,
      durationMs: 3000,
    });
    mockPrisma.project.update.mockResolvedValue({});
    mockPrisma.workspace.update.mockResolvedValue({});

    const result = await executePipeline({
      projectId: "p1",
      trigger: "manual",
    });

    expect(result.tokenUsage.inputTokens).toBe(50000);
    expect(result.tokenUsage.outputTokens).toBe(10000);
  });
});
