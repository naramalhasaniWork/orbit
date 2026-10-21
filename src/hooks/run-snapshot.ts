import type { RunProgress, TestItem } from "@/hooks/use-run-events";

/** The slice of GET /api/projects/:projectId/runs/:runId that rebuilds live run state. */
export interface RunSnapshot {
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  durationMs: number | null;
  results: Array<{ verdict: string; durationMs: number | null; testCase: { id: string; name: string } }>;
}

export async function fetchRunSnapshot(projectId: string, runId: string): Promise<RunSnapshot | null> {
  const res = await fetch(`/api/projects/${projectId}/runs/${runId}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: RunSnapshot };
  return body.data ?? null;
}

export function snapshotProgress(run: RunSnapshot): RunProgress {
  return {
    status: run.status,
    totalTests: run.totalTests,
    passed: run.passed,
    failed: run.failed,
    flaky: run.flaky,
    completed: run.passed + run.failed + run.flaky,
    currentTest: null,
    lastVerdict: null,
    durationMs: run.durationMs,
  };
}

/** Recorded results win over what the client had; tests only seen live (still running) stay. */
export function mergeSnapshotTests(prev: TestItem[], run: RunSnapshot): TestItem[] {
  const byId = new Map(prev.map((t) => [t.testCaseId, t]));
  for (const r of run.results) {
    byId.set(r.testCase.id, {
      testCaseId: r.testCase.id,
      testCaseName: r.testCase.name,
      status: r.verdict as TestItem["status"],
      durationMs: r.durationMs ?? undefined,
    });
  }
  return Array.from(byId.values());
}
