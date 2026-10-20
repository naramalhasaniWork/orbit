import { describe, it, expect } from "vitest";
import { homeHeadline, latestFinished, passRateOf } from "@/lib/dashboard/home-copy";
import { toneForRun } from "@/lib/status-tone";

interface R {
  status: string;
  passed: number;
  failed: number;
  flaky: number;
}
const run = (status: string, passed = 0, failed = 0, flaky = 0): R => ({ status, passed, failed, flaky });

describe("home: every number and sentence describes the same run", () => {
  it("regression: a failed run newer than a passing one wins everywhere (was 100% next to a red tick)", () => {
    const runs = [run("executing"), run("failed", 6, 1), run("completed", 3)];
    const latest = latestFinished(runs);
    expect(latest).toBe(runs[1]);
    expect(passRateOf(latest)).toBe(86);
    expect(homeHeadline(runs.slice(1))).toBe("One test failed in the latest run.");
  });

  it("a failed run that executed nothing has no pass rate and is not called a pass", () => {
    const runs = [run("failed"), run("completed", 5)];
    expect(passRateOf(latestFinished(runs))).toBeNull();
    expect(homeHeadline(runs)).toBe("The latest run failed before its tests finished.");
  });

  it("cancelled and queued runs are skipped, consistently", () => {
    const runs = [run("cancelled", 1, 1), run("queued"), run("completed", 4)];
    expect(latestFinished(runs)).toBe(runs[2]);
    expect(homeHeadline(runs)).toBe("Everything passed on the latest run.");
  });

  it("invariant over many run sets: 'Everything passed' only with a 100% pass rate, failure copy only for a failed run", () => {
    const statuses = ["completed", "failed", "cancelled", "queued"];
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    for (let i = 0; i < 500; i++) {
      const runs = Array.from({ length: 1 + rnd(5) }, () => run(statuses[rnd(4)], rnd(6), rnd(3), rnd(2)));
      const latest = latestFinished(runs);
      const headline = homeHeadline(runs);
      if (!latest) continue;
      const tone = toneForRun(latest.status, latest);
      if (headline === "Everything passed on the latest run.") {
        expect(tone).toBe("pass");
        expect(passRateOf(latest)).toBe(100);
      }
      if (/fail/.test(headline)) expect(tone).toBe("fail");
      if (tone === "fail") expect(headline).toMatch(/fail/);
    }
  });
});
