import { describe, it, expect } from "vitest";
import { clickSelection, pruneSelection, rangeBetween, type SelectionState } from "@/lib/selection";
import { runBulk, summarizeBulk } from "@/lib/bulk";

const ids = ["a", "b", "c", "d", "e"];
const empty: SelectionState = { selected: new Set(), anchor: null };

describe("rangeBetween", () => {
  it("is inclusive and direction independent", () => {
    expect(rangeBetween(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("falls back to the target when the anchor is not visible", () => {
    expect(rangeBetween(ids, "zzz", "c")).toEqual(["c"]);
    expect(rangeBetween(ids, "a", "zzz")).toEqual([]);
  });
});

describe("clickSelection", () => {
  it("toggles a single row and sets the anchor", () => {
    const s1 = clickSelection(empty, ids, "b", false);
    expect(Array.from(s1.selected)).toEqual(["b"]);
    expect(s1.anchor).toBe("b");
    const s2 = clickSelection(s1, ids, "b", false);
    expect(s2.selected.size).toBe(0);
  });

  it("shift-click selects the range from the anchor", () => {
    const s1 = clickSelection(empty, ids, "b", false);
    const s2 = clickSelection(s1, ids, "d", true);
    expect(Array.from(s2.selected).sort()).toEqual(["b", "c", "d"]);
    expect(s2.anchor).toBe("d");
  });

  it("shift-click on a selected row deselects the range", () => {
    let s = clickSelection(empty, ids, "a", false);
    s = clickSelection(s, ids, "e", true);
    expect(s.selected.size).toBe(5);
    s = clickSelection(s, ids, "c", false); // anchor c, now unchecked
    s = clickSelection(s, ids, "e", true); // e is checked -> unchecks c..e
    expect(Array.from(s.selected).sort()).toEqual(["a", "b"]);
  });

  it("shift-click without an anchor acts like a plain click", () => {
    const s = clickSelection(empty, ids, "c", true);
    expect(Array.from(s.selected)).toEqual(["c"]);
  });

  it("shift-click uses the filtered order it is given", () => {
    const visible = ["a", "c", "e"];
    let s = clickSelection(empty, visible, "a", false);
    s = clickSelection(s, visible, "e", true);
    expect(Array.from(s.selected).sort()).toEqual(["a", "c", "e"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that are no longer visible", () => {
    expect(Array.from(pruneSelection(new Set(["a", "x"]), ids))).toEqual(["a"]);
  });
});

describe("runBulk", () => {
  it("collects successes and per-item failures without stopping", async () => {
    const result = await runBulk(["1", "2", "3", "4"], async (id) => {
      if (id === "2") throw new Error("boom");
    });
    expect(result.succeeded.sort()).toEqual(["1", "3", "4"]);
    expect(result.failed).toEqual([{ id: "2", message: "boom" }]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await runBulk(["1", "2", "3", "4", "5", "6"], async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    }, 2);
    expect(peak).toBe(2);
  });

  it("runs strictly in order at concurrency 1", async () => {
    const order: string[] = [];
    await runBulk(["a", "b", "c"], async (id) => void order.push(id), 1);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("handles an empty list", async () => {
    expect(await runBulk([], async () => {})).toEqual({ succeeded: [], failed: [] });
  });
});

describe("summarizeBulk", () => {
  it("reports full and partial success", () => {
    expect(summarizeBulk("Cancelled", { succeeded: ["1", "2"], failed: [] })).toBe("Cancelled 2 items.");
    expect(summarizeBulk("Cancelled", { succeeded: ["1"], failed: [] })).toBe("Cancelled 1 item.");
    expect(
      summarizeBulk("Started", { succeeded: ["1"], failed: [{ id: "2", message: "Limit reached" }] })
    ).toBe("Started 1 of 2. 1 failed: Limit reached");
  });
});
