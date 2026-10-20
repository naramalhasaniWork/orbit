import { describe, it, expect } from "vitest";
import { filterRuns, paginate, sortRuns, isRunSort } from "@/lib/runs/run-list";
import type { RunListItem } from "@/components/runs/run-types";

function run(id: string, over: Partial<RunListItem> = {}): RunListItem {
  return {
    id,
    sequenceNumber: Number(id),
    prNumber: null,
    status: "completed",
    mode: "full",
    trigger: "manual",
    totalTests: 10,
    passed: 10,
    failed: 0,
    flaky: 0,
    skipped: 0,
    durationMs: 1000,
    branch: null,
    commitSha: null,
    createdAt: new Date(2026, 0, Number(id)),
    ...over,
  };
}

const runs = [
  run("1", { failed: 3, durationMs: 500 }),
  run("2", { status: "failed", mode: "smoke", durationMs: null }),
  run("3", { trigger: "push", failed: 1, durationMs: 9000 }),
];

describe("filterRuns", () => {
  it("treats empty values as no filter", () => {
    expect(filterRuns(runs, { status: "", mode: "", trigger: "" })).toHaveLength(3);
  });

  it("combines filters", () => {
    expect(filterRuns(runs, { status: "", mode: "full", trigger: "push" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterRuns(runs, { status: "failed", mode: "", trigger: "" }).map((r) => r.id)).toEqual(["2"]);
  });
});

describe("sortRuns", () => {
  const ids = (s: Parameters<typeof sortRuns>[1]) => sortRuns(runs, s).map((r) => r.id);

  it("sorts by date, duration and failures", () => {
    expect(ids("newest")).toEqual(["3", "2", "1"]);
    expect(ids("oldest")).toEqual(["1", "2", "3"]);
    expect(ids("duration")).toEqual(["3", "1", "2"]);
    expect(ids("failures")).toEqual(["1", "3", "2"]);
  });

  it("does not mutate the input", () => {
    sortRuns(runs, "oldest");
    expect(runs.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 60 }, (_, i) => i);

  it("slices pages", () => {
    expect(paginate(items, 1, 25).items).toHaveLength(25);
    const last = paginate(items, 3, 25);
    expect(last.items).toEqual(items.slice(50));
    expect(last.pageCount).toBe(3);
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(items, 99, 25).page).toBe(3);
    expect(paginate(items, 0, 25).page).toBe(1);
    expect(paginate([], 4).page).toBe(1);
  });
});

describe("isRunSort", () => {
  it("rejects unknown values from the URL", () => {
    expect(isRunSort("duration")).toBe(true);
    expect(isRunSort("bogus")).toBe(false);
    expect(isRunSort("toString")).toBe(false);
  });
});
