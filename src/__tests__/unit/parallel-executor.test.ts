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
vi.mock("@/services/execution/environment-validator", () => ({ validateEnvironment: vi.fn() }));
vi.mock("@/services/execution/flaky-registry", () => ({
  isTestQuarantined: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/services/execution/case-dispatcher", () => ({ executeCaseByType: vi.fn() }));
vi.mock("@/services/execution/test-result-store", () => ({
  saveTestResult: vi.fn(),
  recordEnvironmentError: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { executeCaseByType } from "@/services/execution/case-dispatcher";
import { saveTestResult, recordEnvironmentError } from "@/services/execution/test-result-store";
import { validateEnvironment } from "@/services/execution/environment-validator";
import { executeParallel } from "@/services/orchestrator/parallel-executor";

const db = prisma as unknown as {
  testRun: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  testCase: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};
const dispatch = executeCaseByType as ReturnType<typeof vi.fn>;

function row(id: string, type: string) {
  return { id, name: id, type, journey: "j1", steps: [], projectId: "p1", isCritical: false };
}

const options = {
  runId: "run-1", testPlanId: "plan-1", environmentId: "env-1", mode: "full", maxConcurrency: 1,
};
const okResult = { verdict: "pass", durationMs: 1, steps: [], artifacts: {}, healedSelectors: [] };

describe("executeParallel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.testRun.findUniqueOrThrow.mockResolvedValue({ projectId: "p1" });
    (validateEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true, environmentUrl: "https://staging.example.com", credentials: {}, errors: [],
    });
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
      "https://staging.example.com", {}, { storageState: undefined }
    );
    expect(saveTestResult).toHaveBeenCalledTimes(2);
    expect(saveTestResult).toHaveBeenCalledWith("run-1", "tc-1", "pass", 1, [], {}, []);
    expect(result).toMatchObject({ passed: 1, failed: 0, skipped: 1 });
  });

  it("records every case as environment_error and returns the reason when validation fails", async () => {
    (validateEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false, environmentUrl: "", credentials: {}, errors: ["URL unreachable"],
    });

    const result = await executeParallel(options);

    expect(dispatch).not.toHaveBeenCalled();
    expect(recordEnvironmentError).toHaveBeenCalledWith(
      "run-1", ["tc-1", "tc-v"], "Environment validation failed: URL unreachable"
    );
    expect(result).toMatchObject({
      skipped: 2, environmentError: "Environment validation failed: URL unreachable",
    });
  });

  it("shares a logged-in session with later cases, including visual ones", async () => {
    const session = { cookies: [{ name: "sid" }], origins: [] };
    dispatch
      .mockResolvedValueOnce({ ...okResult, storageState: session })
      .mockResolvedValueOnce(okResult);

    await executeParallel(options);

    expect(dispatch.mock.calls[1][4]).toEqual({ storageState: session });
  });

  it("resolves credentials per required role and keeps one session per role", async () => {
    (validateEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true, environmentUrl: "https://staging.example.com", errors: [],
      credentials: { TEST_EMAIL: "member@x.com", ADMIN_EMAIL: "admin@x.com" },
    });
    db.testCase.findMany.mockReset();
    db.testCase.findMany
      .mockResolvedValueOnce([
        { id: "m1", journey: "j1" }, { id: "a1", journey: "j1" }, { id: "a2", journey: "j1" }, { id: "m2", journey: "j1" },
      ])
      .mockResolvedValueOnce([
        { ...row("m1", "e2e"), requiredRole: null },
        { ...row("a1", "e2e"), requiredRole: "admin" },
        { ...row("a2", "e2e"), requiredRole: "admin" },
        { ...row("m2", "e2e"), requiredRole: null },
      ]);
    const memberSession = { cookies: [{ name: "member" }], origins: [] };
    const adminSession = { cookies: [{ name: "admin" }], origins: [] };
    dispatch
      .mockResolvedValueOnce({ ...okResult, storageState: memberSession })
      .mockResolvedValueOnce({ ...okResult, storageState: adminSession })
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce(okResult);

    await executeParallel(options);

    const calls = dispatch.mock.calls;
    // Admin cases get the admin login mapped onto TEST_*; member cases don't
    expect(calls[1][3]).toMatchObject({ TEST_EMAIL: "admin@x.com" });
    expect(calls[0][3]).toMatchObject({ TEST_EMAIL: "member@x.com" });
    // The first admin case must not inherit the member session
    expect(calls[1][4]).toEqual({ storageState: undefined });
    expect(calls[2][4]).toEqual({ storageState: adminSession });
    expect(calls[3][4]).toEqual({ storageState: memberSession });
  });
});
