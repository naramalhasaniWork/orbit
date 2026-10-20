import { describe, it, expect } from "vitest";
import {
  filterTestCases,
  groupByJourney,
  hasActiveTestCaseFilters,
  isShowFilter,
  resolveExpandedPlanId,
} from "@/lib/plans/test-case-filter";
import type { TestCaseData } from "@/components/plans/plan-types";

function tc(id: string, over: Partial<TestCaseData> = {}): TestCaseData {
  return {
    id,
    name: `Case ${id}`,
    type: "journey",
    journey: "Checkout",
    priorityScore: 50,
    criticality: 0,
    risk: 0,
    coverageGap: 0,
    steps: [],
    rationale: null,
    edgeCases: [],
    isEnabled: true,
    isCritical: false,
    lastVerdict: null,
    ...over,
  };
}

const cases = [
  tc("1", { name: "Pay with card", journey: "Checkout" }),
  tc("2", { name: "Login fails", type: "auth", journey: "Auth", isEnabled: false }),
  tc("3", { name: "Empty cart", type: "edge_case", journey: null, rationale: "Guards the checkout page" }),
];
const none = { q: "", type: "", show: "all" };

describe("filterTestCases", () => {
  it("returns everything with no filters", () => {
    expect(filterTestCases(cases, none)).toHaveLength(3);
  });

  it("filters by type and approval state", () => {
    expect(filterTestCases(cases, { ...none, type: "auth" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterTestCases(cases, { ...none, show: "skipped" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterTestCases(cases, { ...none, show: "enabled" }).map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("searches name, journey and rationale case-insensitively", () => {
    expect(filterTestCases(cases, { ...none, q: "CHECKOUT" }).map((c) => c.id)).toEqual(["1", "3"]);
    expect(filterTestCases(cases, { ...none, q: "  login " }).map((c) => c.id)).toEqual(["2"]);
  });
});

describe("hasActiveTestCaseFilters", () => {
  it("ignores defaults", () => {
    expect(hasActiveTestCaseFilters(none)).toBe(false);
    expect(hasActiveTestCaseFilters({ q: " ", type: "", show: "" })).toBe(false);
    expect(hasActiveTestCaseFilters({ ...none, show: "skipped" })).toBe(true);
  });
});

describe("groupByJourney", () => {
  it("keeps first-seen order and buckets missing journeys", () => {
    const groups = groupByJourney(cases);
    expect(groups.map((g) => g.journey)).toEqual(["Checkout", "Auth", "Uncategorized"]);
  });
});

describe("isShowFilter", () => {
  it("rejects values not in the list", () => {
    expect(isShowFilter("skipped")).toBe(true);
    expect(isShowFilter("constructor")).toBe(false);
  });
});

describe("resolveExpandedPlanId", () => {
  const plans = [
    { id: "a", isActive: false },
    { id: "b", isActive: true },
  ];

  it("defaults to the active plan", () => {
    expect(resolveExpandedPlanId("", plans)).toBe("b");
  });

  it("honours the URL, including collapsed-all", () => {
    expect(resolveExpandedPlanId("a", plans)).toBe("a");
    expect(resolveExpandedPlanId("none", plans)).toBeNull();
  });

  it("falls back for ids that no longer exist", () => {
    expect(resolveExpandedPlanId("gone", plans)).toBe("b");
    expect(resolveExpandedPlanId("", [])).toBeNull();
  });
});
