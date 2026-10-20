"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONES, toneForVerdict } from "@/lib/status-tone";
import type { RunDetailData } from "@/components/runs/run-types";

/** Toggle chips: one per verdict present in the run, with glyph and count. */
export function VerdictFilterBar({
  results, selected, onSelect,
}: { results: RunDetailData["results"]; selected: string | null; onSelect: (v: string | null) => void }) {
  const verdicts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    return counts;
  }, [results]);

  const chip = (active: boolean) =>
    cn(
      "tm-label inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-foreground text-foreground" : "border-border text-tm-t2 hover:bg-accent"
    );

  return (
    <div role="group" aria-label="Filter by verdict" className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={!selected} onClick={() => onSelect(null)} className={chip(!selected)}>
        All <span className="tm-num">{results.length}</span>
      </button>
      {Object.entries(verdicts).map(([verdict, count]) => {
        const spec = STATUS_TONES[toneForVerdict(verdict)];
        return (
          <button
            key={verdict}
            type="button"
            aria-pressed={selected === verdict}
            onClick={() => onSelect(selected === verdict ? null : verdict)}
            className={chip(selected === verdict)}
          >
            <span aria-hidden="true" className={spec.text}>{spec.glyph}</span>
            {verdict.replace("_", " ")} <span className="tm-num">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
