"use client";

import { useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { PlanTestCase } from "../onboarding-types";

const MAX_CHIPS = 4;

interface Journey {
  name: string;
  tests: PlanTestCase[];
  /** Why the journey is in the plan: the planner's rationale for its highest-priority test. */
  why: string | null;
  touches: string[];
}

function groupJourneys(tests: PlanTestCase[]): Journey[] {
  const map = new Map<string, PlanTestCase[]>();
  for (const t of tests) {
    const key = t.journey ?? "Other";
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return Array.from(map.entries())
    .map(([name, list]) => {
      const lead = [...list].sort((a, b) => b.priorityScore - a.priorityScore)[0];
      return {
        name,
        tests: list,
        why: lead?.rationale ?? null,
        touches: Array.from(new Set(list.flatMap((t) => t.touches ?? []))),
      };
    })
    .sort((a, b) => Math.max(...b.tests.map((t) => t.priorityScore)) - Math.max(...a.tests.map((t) => t.priorityScore)));
}

function TouchChips({ routes }: { routes: string[] }) {
  if (routes.length === 0) return null;
  const shown = routes.slice(0, MAX_CHIPS);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="tm-label text-tm-t3">Touches</span>
      {shown.map((r) => (
        <span key={r} className="max-w-[180px] truncate rounded-sm border border-border px-1.5 py-px font-mono text-[11px] text-tm-t2">
          {r.replace(/^route:/, "")}
        </span>
      ))}
      {routes.length > MAX_CHIPS && <span className="tm-num text-[11px] text-tm-t3">+{routes.length - MAX_CHIPS}</span>}
    </div>
  );
}

/** The plan as journeys: what Orbit will walk, why, and which routes each journey goes through. */
export function PlanJourneys({ tests, onToggle }: { tests: PlanTestCase[]; onToggle: (id: string) => void }) {
  const journeys = useMemo(() => groupJourneys(tests), [tests]);

  return (
    <ol className="divide-y divide-border">
      {journeys.map((j, i) => (
        <li
          key={j.name}
          className="motion-safe:animate-slide-up space-y-2 [animation-fill-mode:both] px-4 py-4"
          style={{ animationDelay: `${staggerDelay(i) * 1000}ms` }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-medium">{j.name}</h3>
            <span className="tm-num shrink-0 text-[11px] text-tm-t3">
              {j.tests.filter((t) => t.isEnabled).length}/{j.tests.length} on
            </span>
          </div>
          {j.why && <p className="line-clamp-2 text-pretty text-[13px] leading-snug text-tm-t2">{j.why}</p>}
          <TouchChips routes={j.touches} />
          <ul className="space-y-0.5 pt-1">
            {j.tests.map((test) => (
              <li key={test.id} className={cn("flex items-center gap-3 py-1", !test.isEnabled && "opacity-50")}>
                <span aria-hidden="true" className={cn("tm-label w-4 shrink-0", test.isCritical ? "text-foreground" : "text-tm-t3")}>
                  {test.isCritical ? "■" : "·"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{test.name}</span>
                {test.isCritical && <span className="tm-label text-tm-t2">Critical</span>}
                <Switch
                  checked={test.isEnabled}
                  onCheckedChange={() => onToggle(test.id)}
                  aria-label={`${test.isEnabled ? "Skip" : "Include"} ${test.name}`}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
