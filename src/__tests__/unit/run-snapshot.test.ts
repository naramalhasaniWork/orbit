import { describe, it, expect } from "vitest";
import { mergeSnapshotTests, snapshotProgress, type RunSnapshot } from "@/hooks/run-snapshot";

const run: RunSnapshot = {
  status: "executing",
  totalTests: 3,
  passed: 1,
  failed: 1,
  flaky: 0,
  durationMs: null,
  results: [
    { verdict: "pass", durationMs: 1200, testCase: { id: "a", name: "Sign in" } },
    { verdict: "fail", durationMs: null, testCase: { id: "b", name: "Checkout" } },
  ],
};

describe("run snapshot (replay_gap resync)", () => {
  it("rebuilds progress counters from the run record", () => {
    expect(snapshotProgress(run)).toMatchObject({ status: "executing", totalTests: 3, completed: 2, passed: 1, failed: 1 });
  });

  it("lets recorded results replace stale test rows and keeps tests only seen live", () => {
    const merged = mergeSnapshotTests(
      [
        { testCaseId: "a", testCaseName: "Sign in", status: "running" },
        { testCaseId: "c", testCaseName: "Search", status: "running" },
      ],
      run
    );
    expect(merged.map((t) => [t.testCaseId, t.status]).sort()).toEqual([["a", "pass"], ["b", "fail"], ["c", "running"]]);
    expect(merged.find((t) => t.testCaseId === "a")?.durationMs).toBe(1200);
  });
});
