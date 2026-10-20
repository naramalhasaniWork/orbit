import type { TestCaseData } from "@/components/plans/plan-types";

export const SHOW_OPTIONS = {
  all: "All",
  enabled: "Approved",
  skipped: "Skipped",
} as const;
export type ShowFilter = keyof typeof SHOW_OPTIONS;

export interface TestCaseFilters {
  q: string;
  type: string;
  show: string;
}

export function isShowFilter(value: string): value is ShowFilter {
  return Object.prototype.hasOwnProperty.call(SHOW_OPTIONS, value);
}

export function filterTestCases(cases: readonly TestCaseData[], f: TestCaseFilters): TestCaseData[] {
  const q = f.q.trim().toLowerCase();
  return cases.filter((tc) => {
    if (f.type && tc.type !== f.type) return false;
    if (f.show === "enabled" && !tc.isEnabled) return false;
    if (f.show === "skipped" && tc.isEnabled) return false;
    if (q) {
      const haystack = `${tc.name} ${tc.journey ?? ""} ${tc.rationale ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function hasActiveTestCaseFilters(f: TestCaseFilters): boolean {
  return !!(f.q.trim() || f.type || (f.show && f.show !== "all"));
}

export function groupByJourney(
  testCases: readonly TestCaseData[]
): Array<{ journey: string; cases: TestCaseData[] }> {
  const groups = new Map<string, TestCaseData[]>();
  for (const tc of testCases) {
    const key = tc.journey ?? "Uncategorized";
    const existing = groups.get(key);
    if (existing) existing.push(tc);
    else groups.set(key, [tc]);
  }
  return Array.from(groups.entries()).map(([journey, cases]) => ({ journey, cases }));
}

/** Plan to show expanded: the URL's choice, "none" for all collapsed, else the active plan. */
export function resolveExpandedPlanId(
  param: string,
  plans: ReadonlyArray<{ id: string; isActive: boolean }>
): string | null {
  if (param === "none") return null;
  if (param && plans.some((p) => p.id === param)) return param;
  return plans.find((p) => p.isActive)?.id ?? null;
}
