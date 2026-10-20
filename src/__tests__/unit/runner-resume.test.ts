import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, dispatch, save, loadCases } = vi.hoisted(() => ({
  db: {
    testRun: { update: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    testCase: { update: vi.fn() },
    testResult: { findMany: vi.fn() },
  },
  dispatch: vi.fn(),
  save: vi.fn(),
  loadCases: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/websocket", () => ({
  emitRunProgress: vi.fn(), emitRunStarted: vi.fn(), emitRunCompleted: vi.fn(),
  emitTestStarted: vi.fn(), emitTestCompleted: vi.fn(),
}));
vi.mock("@/lib/redis/pubsub", () => ({ publish: vi.fn(), channels: { runProgress: (id: string) => id } }));
vi.mock("@/lib/redis/lock", () => ({ acquireLock: vi.fn(), releaseLock: vi.fn() }));
vi.mock("@/services/execution/environment-validator", () => ({
  validateEnvironment: vi.fn(async () => ({
    valid: true, environmentUrl: "https://app.test", credentials: {}, errors: [], warnings: [],
  })),
}));
vi.mock("@/services/execution/flaky-registry", () => ({ isTestQuarantined: vi.fn(async () => false) }));
vi.mock("@/services/execution/case-dispatcher", () => ({ executeCaseByType: dispatch }));
vi.mock("@/services/execution/test-case-loader", () => ({ loadTestCases: loadCases }));
vi.mock("@/lib/billing/run-credits", () => ({ chargeRunCredits: vi.fn(async () => 0) }));
vi.mock("@/services/execution/test-result-store", () => ({ saveTestResult: save, recordEnvironmentError: vi.fn() }));
vi.mock("@/services/mcp/tool-injector", () => ({ clearRunToolCallCount: vi.fn() }));
vi.mock("@/services/orchestrator/run-manager", () => ({ isRunCancelled: vi.fn(async () => false) }));
vi.mock("@/services/reporting/integrations/outbound-webhooks", () => ({
  dispatchRunStarted: vi.fn(async () => undefined), dispatchRunCompleted: vi.fn(async () => undefined),
}));

import { acquireLock } from "@/lib/redis/lock";
import { RunLockedError } from "@/lib/queue/run-locked";
import { executeRun } from "@/services/execution/runner";
import { requestShutdown, resetShutdownForTests, ShutdownError } from "@/lib/queue/shutdown";

const ok = { verdict: "pass", durationMs: 1, steps: [], artifacts: {}, healedSelectors: [] };
const cases = [
  { id: "a", name: "Browse the catalog" },
  { id: "b", name: "Login with valid credentials" },
  { id: "c", name: "Checkout" },
];

describe("sequential runner resume + shutdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetShutdownForTests();
    (acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue({ key: "k", acquired: true });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.testRun.findUniqueOrThrow.mockResolvedValue({ id: "r", projectId: "p", mode: "full", trigger: "manual", metadata: {} });
    db.testRun.findUnique.mockResolvedValue({ startedAt: new Date(), projectId: "p", mode: "full", trigger: "manual" });
    loadCases.mockResolvedValue(cases);
    db.testResult.findMany.mockResolvedValue([]);
    dispatch.mockResolvedValue(ok);
  });

  it("skips cases that already have a result (except login cases) and counts them", async () => {
    db.testResult.findMany.mockResolvedValue([
      { testCaseId: "a", verdict: "pass" },
      { testCaseId: "b", verdict: "pass" },
    ]);

    await executeRun({ runId: "r", environmentId: "e" });

    const ran = dispatch.mock.calls.map((c) => c[1].id);
    expect(ran).toEqual(["b", "c"]); // "a" skipped; login case "b" rebuilds the session
    const completed = db.testRun.update.mock.calls.map((c) => c[0].data).find((d) => d.status === "completed");
    expect(completed).toMatchObject({ passed: 3, failed: 0 });
  });

  it("throws ShutdownError between cases without failing the run", async () => {
    dispatch.mockImplementationOnce(async () => {
      requestShutdown();
      return ok;
    });

    await expect(executeRun({ runId: "r", environmentId: "e" })).rejects.toBeInstanceOf(ShutdownError);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1); // the finished case is recorded before stopping
    const statuses = db.testRun.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).not.toContain("failed");
    expect(statuses).not.toContain("completed");
  });

  it("throws a retryable RunLockedError when the lock is held and the run is still executing", async () => {
    (acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue({ key: "k", acquired: false });
    db.testRun.findUnique.mockResolvedValue({ status: "executing" });

    const err = await executeRun({ runId: "r", environmentId: "e" }).catch((e) => e);

    expect(err).toBeInstanceOf(RunLockedError);
    expect(err.retryAfterMs).toBeGreaterThan(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns quietly when the lock is held but the run already finished", async () => {
    (acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue({ key: "k", acquired: false });
    db.testRun.findUnique.mockResolvedValue({ status: "completed" });

    await expect(executeRun({ runId: "r", environmentId: "e" })).resolves.toBeUndefined();
  });
});
