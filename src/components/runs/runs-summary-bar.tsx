"use client";

import { GroundTrack } from "@/components/telemetry/ground-track";
import { toneForRun, type StatusTone } from "@/lib/status-tone";
import { STATUS_TONES } from "@/lib/status-tone";
import { type RunListItem } from "@/components/runs/run-types";

interface RunsSummaryBarProps {
  runs: RunListItem[];
}

const TRACK_RUNS = 30;
const ORDER: StatusTone[] = ["live", "pass", "fail", "flaky", "skipped"];

/** The project's recent runs as one ground track, with counts by result. */
export function RunsSummaryBar({ runs }: RunsSummaryBarProps) {
  if (runs.length === 0) return null;
  const tones = runs.map((r) => toneForRun(r.status, r));
  const counts = new Map<StatusTone, number>();
  for (const t of tones) counts.set(t, (counts.get(t) ?? 0) + 1);
  const recent = tones.slice(0, TRACK_RUNS).reverse().map((tone) => ({ tone }));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {ORDER.filter((t) => counts.has(t)).map((t) => (
          <span key={t} className={`tm-label ${STATUS_TONES[t].text}`}>
            <span aria-hidden="true">{STATUS_TONES[t].glyph} </span>
            {STATUS_TONES[t].label} <span className="tm-num">{counts.get(t)}</span>
          </span>
        ))}
      </div>
      <GroundTrack ticks={recent} slots={TRACK_RUNS} noun="recent runs" className="min-w-0 flex-1" />
    </div>
  );
}
