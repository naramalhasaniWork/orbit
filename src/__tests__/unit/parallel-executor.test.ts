import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    testRun: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    testCase: { findMany: vi.fn(), update: vi.fn() },
    testResult: { create: vi.fn() },
  },
}));
vi.mock("@/lib/websocket", () => ({ emitRunProgress: vi.fn() }));
vi.mock("@/services/orchestrator/run-manager", () => ({
  isRunCancelled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/services/execution/environment-validator", () => ({
  validateEnvironment: vi.fn().mockResolvedValue({
    valid: true, environmentUrl: "https://staging.example.com", credentials: {},
  }),
}));
vi.mock("@/services/execution/flaky-registry", () => ({
  isTestQuarantined: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/services/execution/case-dispatcher", () => ({ executeCaseByType: vi.fn() }));
vi.mock("@/services/execution/test-result-store", () => ({ saveTestResult: vi.fn() }));

import { prisma } from "@/lib/db";
import { executeCaseByType } from "@/services/execution/case-dispatcher";
import { saveTestResult } from "@/services/execution/test-result-store";
import { executeParallel } from "@/services/orchestrator/parallel-executor";

const db = prisma as unknown as {
  testRun: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  testCase: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};
const dispatch = executeCaseByType as ReturnType<typeof vi.fn>;

function row(id: string, type: string) {
  return { id, name: id, type, journey: "j1", steps: [], projectId: "p1", isCritical: false };
}

describe("executeParallel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.testRun.findUniqueOrThrow.mockResolvedValue({ projectId: "p1" });
    db.testCase.findMany
      .mockResolvedValueOnce([{ id: "tc-1", journey: "j1" }, { id: "tc-v", journey: "j1" }])
      .mockResolvedValueOnce([row("tc-1", "e2e"), row("tc-v", "visual_regression")]);
  });

  it("dispatches by type and records every executed case", async () => {
    dispatch
      .mockResolvedValueOnce({ verdict: "pass", durationMs: 1, steps: [], artifacts: {}, healedSelectors: [] })
      .mockResolvedValueOnce({ verdict: "environment_error", durationMs: 1, steps: [], artifacts: {}, healedSelectors: [] });

    const result = await executeParallel({
      runId: "run-1", testPlanId: "plan-1", environmentId: "env-1", mode: "full", maxConcurrency: 2,
    });

    expect(dispatch).toHaveBeenCalledWith(
      "run-1", expect.objectContaining({ id: "tc-v", type: "visual_regression" }),
      "https://staging.example.com", {}
    );
    expect(saveTestResult).toHaveBeenCalledTimes(2);
    expect(saveTestResult).toHaveBeenCalledWith("run-1", "tc-1", "pass", 1, [], {}, []);
    expect(result).toMatchObject({ passed: 1, failed: 0, skipped: 1 });
  });
});
