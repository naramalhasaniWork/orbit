import type { RunListItem } from "@/components/runs/run-types";

export const RUN_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  duration: "Longest first",
  failures: "Most failures",
} as const;
export type RunSort = keyof typeof RUN_SORTS;

export const RUN_PAGE_SIZE = 25;

/** Runs that can still be cancelled (the cancel endpoint rejects anything else). */
export const CANCELLABLE_RUN_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "indexing",
  "planning",
  "executing",
]);

export interface RunFilters {
  status: string;
  mode: string;
  trigger: string;
}

export function isRunSort(value: string): value is RunSort {
  return Object.prototype.hasOwnProperty.call(RUN_SORTS, value);
}

export function filterRuns(runs: readonly RunListItem[], f: RunFilters): RunListItem[] {
  return runs.filter(
    (r) =>
      (!f.status || r.status === f.status) &&
      (!f.mode || r.mode === f.mode) &&
      (!f.trigger || r.trigger === f.trigger)
  );
}

const time = (r: RunListItem) => new Date(r.createdAt).getTime();

export function sortRuns(runs: readonly RunListItem[], sort: RunSort): RunListItem[] {
  const copy = [...runs];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => time(a) - time(b));
    case "duration":
      return copy.sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1) || time(b) - time(a));
    case "failures":
      return copy.sort((a, b) => b.failed - a.failed || time(b) - time(a));
    default:
      return copy.sort((a, b) => time(b) - time(a));
  }
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

/** 1-based page, clamped into range so a stale `?page=9` still shows the last page. */
export function paginate<T>(items: readonly T[], page: number, size = RUN_PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
    total: items.length,
  };
}
