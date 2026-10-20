import { toneForRun, isLiveRunStatus, type StatusTone } from "@/lib/status-tone";
import type { GroundTrackTick } from "@/components/telemetry/ground-track";

/** The fields of /api/projects/[id]/runs the sidebar reads. */
export interface SidebarRun {
  id: string;
  sequenceNumber: number;
  status: string;
  failed: number;
  flaky: number;
  createdAt: string;
}

export interface ProjectRuns {
  projectId: string;
  projectName: string;
  runs: SidebarRun[];
}

export interface NeedsYouRow {
  runId: string;
  projectId: string;
  projectName: string;
  sequenceNumber: number;
  tone: Extract<StatusTone, "fail" | "flaky">;
  count: number;
  createdAt: string;
}

export const STRIP_RUNS = 14;
export const NEEDS_YOU_MAX = 6;

/** Last 14 runs, oldest on the left so the newest lands at the right edge. */
export function stripTicks(runs: SidebarRun[]): GroundTrackTick[] {
  return runs
    .slice(0, STRIP_RUNS)
    .reverse()
    .map((r) => ({ tone: toneForRun(r.status, r) }));
}

/**
 * A project needs you when its latest finished run failed or flaked.
 * Runs arrive newest first; live and queued runs are skipped.
 */
export function needsYou(projects: ProjectRuns[]): NeedsYouRow[] {
  const rows: NeedsYouRow[] = [];
  for (const p of projects) {
    const latest = p.runs.find((r) => !isLiveRunStatus(r.status) && r.status !== "queued");
    if (!latest) continue;
    const tone = toneForRun(latest.status, latest);
    if (tone !== "fail" && tone !== "flaky") continue;
    rows.push({
      runId: latest.id,
      projectId: p.projectId,
      projectName: p.projectName,
      sequenceNumber: latest.sequenceNumber,
      tone,
      count: tone === "fail" ? latest.failed : latest.flaky,
      createdAt: latest.createdAt,
    });
  }
  return rows
    .sort((a, b) => (a.tone === b.tone ? b.createdAt.localeCompare(a.createdAt) : a.tone === "fail" ? -1 : 1))
    .slice(0, NEEDS_YOU_MAX);
}
