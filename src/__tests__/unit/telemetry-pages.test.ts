import { describe, it, expect } from "vitest";
import { firstSentence, homeHeadline } from "@/lib/dashboard/home-copy";
import { parseSteps, pickEvidence } from "@/lib/runs/steps";

describe("homeHeadline", () => {
  it("says what the latest finished run did, never more", () => {
    expect(homeHeadline([])).toBe("No runs yet.");
    expect(homeHeadline([{ status: "executing", failed: 0, flaky: 0 }])).toBe("A run is live now.");
    expect(homeHeadline([{ status: "completed", failed: 2, flaky: 0 }])).toBe("2 tests failed in the latest run.");
    expect(homeHeadline([{ status: "completed", failed: 1, flaky: 0 }])).toBe("One test failed in the latest run.");
    expect(homeHeadline([{ status: "completed", failed: 0, flaky: 1 }])).toBe("The latest run passed, with one flaky test.");
    expect(homeHeadline([{ status: "failed", failed: 0, flaky: 0 }])).toBe("The latest run failed before its tests finished.");
    expect(homeHeadline([{ status: "completed", failed: 0, flaky: 0 }])).toBe("Everything passed on the latest run.");
  });

  it("skips queued runs to find the latest finished one", () => {
    expect(
      homeHeadline([
        { status: "queued", failed: 0, flaky: 0 },
        { status: "completed", failed: 3, flaky: 0 },
      ])
    ).toBe("3 tests failed in the latest run.");
  });
});

describe("firstSentence", () => {
  it("takes the first sentence and caps its length", () => {
    expect(firstSentence("The card form loads late. Then Pay submits.")).toBe("The card form loads late.");
    expect(firstSentence(null)).toBeNull();
    expect(firstSentence("x".repeat(300), 20)).toHaveLength(20);
  });
});

describe("step evidence", () => {
  it("parses loose step logs and keeps executor step indices", () => {
    const steps = parseSteps([
      "Open /",
      { action: "Click Pay", status: "failed", stepIndex: 6, durationMs: 1200 },
      { description: "Expect confirmation", status: "skipped" },
    ]);
    expect(steps.map((s) => [s.index, s.status])).toEqual([[0, "pass"], [6, "fail"], [2, "pending"]]);
  });

  it("picks the last shot before the failing step and the first at or after it, for that result only", () => {
    const shots = [
      { url: "a", stepIndex: 2, testResultId: "r1" },
      { url: "b", stepIndex: 5, testResultId: "r1" },
      { url: "c", stepIndex: 6, testResultId: "r1" },
      { url: "d", stepIndex: 5, testResultId: "r2" },
      { url: "e", stepIndex: null, testResultId: "r1" },
    ];
    const { before, after } = pickEvidence(shots, "r1", 6);
    expect(before?.url).toBe("b");
    expect(after?.url).toBe("c");
    expect(pickEvidence(shots, "r3", 6)).toEqual({ before: undefined, after: undefined });
  });
});
