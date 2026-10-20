"use client";

import type { TestItem } from "@/hooks/use-run-events";
import type { StatusTone } from "@/lib/status-tone";
import { LiveList, LiveRow } from "@/components/execution/live-list";

interface TestTimelinePanelProps {
  tests: TestItem[];
  totalTests: number;
  className?: string;
}

const TONE: Record<string, StatusTone> = {
  running: "live",
  passed: "pass",
  healed: "pass",
  failed: "fail",
  flaky: "flaky",
  skipped: "skipped",
};

/** Tests of the live run, in order; the running one grows its bar. */
export function TestTimelinePanel({ tests, totalTests, className }: TestTimelinePanelProps) {
  const completed = tests.filter((t) => t.status !== "running").length;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <LiveList
      title="Tests"
      count={totalTests > 0 ? `${pad(completed)}/${pad(totalTests)}` : pad(completed)}
      empty="Waiting for the first test to start."
      followKey={tests.length}
      className={className}
    >
      {tests.map((t, i) => (
        <LiveRow key={t.testCaseId} index={i} tone={TONE[t.status] ?? "untested"} label={t.testCaseName} durationMs={t.durationMs} />
      ))}
    </LiveList>
  );
}
