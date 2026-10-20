import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { testCase: { update: vi.fn() } } }));
vi.mock("@/lib/websocket", () => ({
  emitRunProgress: vi.fn(), emitTestStarted: vi.fn(), emitTestCompleted: vi.fn(),
}));
vi.mock("@/lib/redis/pubsub", () => ({ publish: vi.fn(), channels: { runProgress: (id: string) => id } }));
vi.mock("@/services/orchestrator/run-manager", () => ({ isRunCancelled: vi.fn() }));
vi.mock("@/services/execution/flaky-registry", () => ({ isTestQuarantined: vi.fn() }));
vi.mock("@/services/execution/case-dispatcher", () => ({ executeCaseByType: vi.fn() }));
vi.mock("@/services/execution/test-result-store", () => ({ saveTestResult: vi.fn() }));

import { executeCaseByType } from "@/services/execution/case-dispatcher";
import { saveTestResult } from "@/services/execution/test-result-store";
import { isRunCancelled } from "@/services/orchestrator/run-manager";
import { isTestQuarantined } from "@/services/execution/flaky-registry";
import { runCases } from "@/server/engine/runner/run-cases";
import { partitionCases } from "@/server/engine/runner/partition";

const dispatch = executeCaseByType as ReturnType<typeof vi.fn>;
const cancelled = isRunCancelled as ReturnType<typeof vi.fn>;
const quarantined = isTestQuarantined as ReturnType<typeof vi.fn>;

function tc(id: string, type = "e2e", extra: Record<string, unknown> = {}) {
  return { id, name: id, type, journey: "j1", steps: [], projectId: "p1", isCritical: false, ...extra };
}

const execution = { executionMode: "replay", modelCalls: 0, modelCostUsd: 0, divergedAtStep: null };
const okResult = { verdict: "pass", durationMs: 1, steps: [], artifacts: {}, healedSelectors: [], execution };
const base = {
  runId: "run-1", environmentId: "env-1", environmentUrl: "https://staging.example.com",
  credentials: {}, concurrency: 1,
};

describe("runCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelled.mockResolvedValue(false);
    quarantined.mockResolvedValue(false);
  });

  it("dispatches by type and records every executed case with its execution meta", async () => {
    dispatch
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce({ ...okResult, verdict: "environment_error" });

    const { counters, stop } = await runCases({
      ...base, concurrency: 2, cases: [tc("tc-1"), tc("tc-v", "visual_regression")],
    });

    expect(dispatch).toHaveBeenCalledWith(
      "run-1", expect.objectContaining({ id: "tc-v", type: "visual_regression" }),
      "https://staging.example.com", {}, { storageState: undefined, environmentId: "env-1" }
    );
    expect(saveTestResult).toHaveBeenCalledTimes(2);
    expect(saveTestResult).toHaveBeenCalledWith("run-1", "tc-1", "pass", 1, [], {}, [], execution);
    expect(counters).toMatchObject({ passed: 1, failed: 0, skipped: 1 });
    expect(stop).toBeNull();
  });

  it("shares a logged-in session with later cases, including visual ones", async () => {
    const session = { cookies: [{ name: "sid" }], origins: [] };
    dispatch.mockResolvedValueOnce({ ...okResult, storageState: session }).mockResolvedValueOnce(okResult);

    await runCases({ ...base, cases: [tc("tc-1"), tc("tc-v", "visual_regression")] });

    expect(dispatch.mock.calls[1][4]).toEqual({ storageState: session, environmentId: "env-1" });
  });

  it("resolves credentials per required role and keeps one session per role", async () => {
    const memberSession = { cookies: [{ name: "member" }], origins: [] };
    const adminSession = { cookies: [{ name: "admin" }], origins: [] };
    dispatch
      .mockResolvedValueOnce({ ...okResult, storageState: memberSession })
      .mockResolvedValueOnce({ ...okResult, storageState: adminSession })
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce(okResult);

    await runCases({
      ...base,
      credentials: { TEST_EMAIL: "member@x.com", ADMIN_EMAIL: "admin@x.com" },
      cases: [tc("m1"), tc("a1", "e2e", { requiredRole: "admin" }), tc("a2", "e2e", { requiredRole: "admin" }), tc("m2")],
    });

    const calls = dispatch.mock.calls;
    // Admin cases get the admin login mapped onto TEST_*; member cases don't
    expect(calls[1][3]).toMatchObject({ TEST_EMAIL: "admin@x.com" });
    expect(calls[0][3]).toMatchObject({ TEST_EMAIL: "member@x.com" });
    // The first admin case must not inherit the member session
    expect(calls[1][4]).toEqual({ storageState: undefined, environmentId: "env-1" });
    expect(calls[2][4]).toEqual({ storageState: adminSession, environmentId: "env-1" });
    expect(calls[3][4]).toEqual({ storageState: memberSession, environmentId: "env-1" });
  });

  it("starts login and unauthenticated tests fresh, and clears the session after an unauth flow", async () => {
    const session = { cookies: [{ name: "sid" }], origins: [] };
    dispatch
      .mockResolvedValueOnce({ ...okResult, storageState: session })
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce({ ...okResult, storageState: session })
      .mockResolvedValueOnce(okResult);

    await runCases({
      ...base,
      cases: [tc("Dashboard loads"), tc("Login with valid credentials"), tc("Redirect when not logged in"), tc("Settings page")],
    });

    const calls = dispatch.mock.calls;
    expect(calls[1][4].storageState).toBeUndefined();
    expect(calls[2][4].storageState).toBeUndefined();
    expect(calls[3][4].storageState).toBeUndefined();
  });

  it("skips quarantined cases and records them as skipped", async () => {
    quarantined.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    dispatch.mockResolvedValue(okResult);

    const { counters } = await runCases({ ...base, cases: [tc("q"), tc("ok")] });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(saveTestResult).toHaveBeenCalledWith("run-1", "q", "skipped", 0, [], {}, []);
    expect(counters).toMatchObject({ passed: 1, skipped: 1 });
  });

  it("records a crashing case as a failed result instead of dropping it", async () => {
    dispatch.mockRejectedValueOnce(new Error("boom"));

    const { counters } = await runCases({ ...base, cases: [tc("tc-1")] });

    expect(counters.failed).toBe(1);
    expect(saveTestResult).toHaveBeenCalledWith("run-1", "tc-1", "fail", 0, [
      expect.objectContaining({ actual: "Uncaught error: boom" }),
    ], {}, []);
  });

  it("stops between cases when the run is cancelled", async () => {
    cancelled.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    dispatch.mockResolvedValue(okResult);

    const { stop } = await runCases({ ...base, cases: [tc("a"), tc("b"), tc("c")] });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(stop).toEqual({ kind: "cancelled" });
  });

  it("aborts after two consecutive AI provider failures", async () => {
    const providerDown = {
      ...okResult, verdict: "environment_error",
      steps: [{ action: "ai_provider", actual: "credit balance too low" }],
    };
    dispatch.mockResolvedValue(providerDown);

    const { stop } = await runCases({ ...base, cases: [tc("a"), tc("b"), tc("c")] });

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(stop).toMatchObject({ kind: "aborted", reason: expect.stringContaining("credit balance too low") });
  });

  it("aborts after three consecutive browser connection failures", async () => {
    dispatch.mockResolvedValue({ ...okResult, verdict: "fail", steps: [{ actual: "connectOverCDP: Timeout" }] });

    const { stop } = await runCases({ ...base, cases: [tc("a"), tc("b"), tc("c"), tc("d")] });

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(stop).toMatchObject({ kind: "aborted", reason: expect.stringContaining("PLAYWRIGHT_WS_ENDPOINT") });
  });
});

describe("partitionCases", () => {
  it("keeps one ordered partition for a single worker", () => {
    const cases = [tc("a", "e2e", { journey: "x" }), tc("b", "e2e", { journey: "y" })];
    expect(partitionCases(cases, 1)).toEqual([cases]);
  });

  it("groups by journey and runs visual cases last when concurrent", () => {
    const v = tc("v", "visual_regression", { journey: "visual_identity" });
    const a = tc("a", "e2e", { journey: "checkout" });
    const b = tc("b", "e2e", { journey: null });
    const c = tc("c", "e2e", { journey: "checkout" });
    expect(partitionCases([v, a, b, c], 3)).toEqual([[a, c], [b], [v]]);
  });
});
