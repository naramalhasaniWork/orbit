import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { testRun: { update: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/websocket", () => ({ emitRunProgress: vi.fn(), emitRunStarted: vi.fn(), emitRunCompleted: vi.fn() }));
vi.mock("@/services/execution/environment-validator", () => ({ validateEnvironment: vi.fn() }));
vi.mock("@/services/execution/test-case-loader", () => ({ loadTestCases: vi.fn() }));
vi.mock("@/lib/billing/run-credits", () => ({ chargeRunCredits: vi.fn().mockResolvedValue(3) }));
vi.mock("@/services/execution/test-result-store", () => ({ recordEnvironmentError: vi.fn() }));
vi.mock("@/services/mcp/tool-injector", () => ({ clearRunToolCallCount: vi.fn() }));
vi.mock("@/services/reporting/integrations/outbound-webhooks", () => ({
  dispatchRunStarted: vi.fn().mockResolvedValue(undefined), dispatchRunCompleted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/redis/lock", () => ({
  acquireLock: vi.fn().mockResolvedValue({ acquired: true }), releaseLock: vi.fn(),
}));
vi.mock("@/server/engine/runner/run-cases", () => ({ runCases: vi.fn() }));

import { prisma } from "@/lib/db";
import { validateEnvironment } from "@/services/execution/environment-validator";
import { loadTestCases } from "@/services/execution/test-case-loader";
import { recordEnvironmentError } from "@/services/execution/test-result-store";
import { runCases } from "@/server/engine/runner/run-cases";
import { executeRun, runTestSuiteParallel } from "@/services/execution/runner";

const db = prisma as unknown as {
  testRun: { update: ReturnType<typeof vi.fn>; findUniqueOrThrow: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
};
const validate = validateEnvironment as ReturnType<typeof vi.fn>;
const load = loadTestCases as ReturnType<typeof vi.fn>;
const loop = runCases as ReturnType<typeof vi.fn>;

const run = { id: "run-1", projectId: "p1", testPlanId: "plan-old", mode: "full", trigger: "manual", prNumber: null, metadata: {} };
const counters = { passed: 2, failed: 0, flaky: 0, skipped: 0 };

function lastStatusUpdate(): Record<string, unknown> | undefined {
  const calls = db.testRun.update.mock.calls.map((c) => c[0].data).filter((d) => "status" in d);
  return calls[calls.length - 1];
}

describe("executeRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.testRun.findUniqueOrThrow.mockResolvedValue({ ...run, environmentId: "env-1" });
    db.testRun.findUnique.mockResolvedValue({ startedAt: new Date(), projectId: "p1", mode: "full", trigger: "manual" });
    validate.mockResolvedValue({ valid: true, environmentUrl: "https://s.example.com", credentials: { K: "v" }, errors: [], warnings: [] });
    load.mockResolvedValue([{ id: "tc-1" }, { id: "tc-2" }]);
    loop.mockResolvedValue({ counters, stop: null });
  });

  it("records every case as environment_error and fails the run when validation fails", async () => {
    validate.mockResolvedValue({ valid: false, environmentUrl: "", credentials: {}, errors: ["URL unreachable"], warnings: [] });

    await executeRun({ runId: "run-1", environmentId: "env-1" });

    expect(loop).not.toHaveBeenCalled();
    expect(recordEnvironmentError).toHaveBeenCalledWith(
      "run-1", ["tc-1", "tc-2"], "Environment validation failed: URL unreachable"
    );
    expect(lastStatusUpdate()).toMatchObject({ status: "failed", summary: "Environment validation failed: URL unreachable" });
  });

  it("runs the case loop with the validated environment and completes the run", async () => {
    await executeRun({ runId: "run-1", environmentId: "env-1" });

    expect(loop).toHaveBeenCalledWith({
      runId: "run-1", environmentId: "env-1", environmentUrl: "https://s.example.com",
      credentials: { K: "v" }, cases: [{ id: "tc-1" }, { id: "tc-2" }], concurrency: 1,
    });
    expect(lastStatusUpdate()).toMatchObject({ status: "completed", passed: 2 });
  });

  it("parallel suites use the pipeline's plan and mode with the requested concurrency", async () => {
    await runTestSuiteParallel("run-1", "plan-new", "smoke", 4);

    expect(load).toHaveBeenCalledWith(expect.objectContaining({ testPlanId: "plan-new", mode: "smoke" }));
    expect(loop).toHaveBeenCalledWith(expect.objectContaining({ concurrency: 4 }));
  });

  it("marks the run cancelled when the loop stops for cancellation", async () => {
    loop.mockResolvedValue({ counters, stop: { kind: "cancelled" } });

    await executeRun({ runId: "run-1", environmentId: "env-1" });

    expect(lastStatusUpdate()).toMatchObject({ status: "cancelled" });
  });

  it("fails the run with the abort reason", async () => {
    loop.mockResolvedValue({ counters, stop: { kind: "aborted", reason: "Browser service unreachable" } });

    await executeRun({ runId: "run-1", environmentId: "env-1" });

    expect(lastStatusUpdate()).toMatchObject({ status: "failed", summary: "Browser service unreachable" });
  });
});
