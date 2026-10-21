import type { PersonView } from "@/lib/avatar/resolve";

export interface RunListItem {
  id: string;
  sequenceNumber: number;
  prNumber: number | null;
  status: string;
  mode: string;
  trigger: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number | null;
  branch: string | null;
  commitSha: string | null;
  createdAt: Date;
  /** Who started it; null for webhook, schedule and API runs. */
  triggeredBy?: PersonView | null;
}

export interface TestResultData {
  id: string;
  verdict: string;
  durationMs: number | null;
  retryCount: number;
  steps: unknown;
  failureExplanation: string | null;
  suggestedFix: string | null;
  artifacts: unknown;
  healedSelectors: unknown;
  testCase: {
    id: string;
    name: string;
    type: string;
    journey: string | null;
    priorityScore: number;
    isCritical: boolean;
  };
}

export interface RunDetailData {
  id: string;
  sequenceNumber: number;
  prNumber: number | null;
  projectName: string;
  status: string;
  mode: string;
  trigger: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number | null;
  branch: string | null;
  commitSha: string | null;
  createdAt: Date;
  triggeredBy?: PersonView | null;
  results: TestResultData[];
}

export const RUN_STATUS_CONFIG: Record<string, { label: string; dot: "pass" | "fail" | "flaky" | "running" | "untested" | "skipped" }> = {
  queued: { label: "Queued", dot: "untested" },
  indexing: { label: "Indexing", dot: "running" },
  planning: { label: "Planning", dot: "running" },
  executing: { label: "Executing", dot: "running" },
  reporting: { label: "Reporting", dot: "running" },
  completed: { label: "Completed", dot: "pass" },
  failed: { label: "Failed", dot: "fail" },
  cancelled: { label: "Cancelled", dot: "skipped" },
};

export const MODE_LABELS: Record<string, string> = {
  full: "Full",
  smoke: "Smoke",
  regression: "Regression",
  targeted: "Targeted",
};

export const TRIGGER_LABELS: Record<string, string> = {
  push: "Push",
  pr: "PR",
  scheduled: "Scheduled",
  manual: "Manual",
  linear: "Linear",
  api: "API",
};

export function formatDuration(ms: number | null): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function getRunVerdictStatus(run: RunListItem): "pass" | "fail" | "flaky" | "running" | "untested" {
  const inProgress = new Set(["queued", "indexing", "planning", "executing", "reporting"]);
  if (inProgress.has(run.status)) return "running";
  if (run.failed > 0) return "fail";
  if (run.flaky > 0) return "flaky";
  if (run.passed > 0) return "pass";
  return "untested";
}
