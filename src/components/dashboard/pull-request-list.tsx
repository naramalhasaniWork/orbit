"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Status } from "@/components/telemetry/status";
import { TransitionLink } from "@/components/layout/transition-link";
import { formatDuration } from "@/components/runs/run-types";
import { sharedName } from "@/lib/view-transition";
import type { PullRequestRow } from "@/lib/dashboard/launchpad-shape";

const CHIPS = 3;

function JourneyChips({ journeys }: { journeys: string[] }) {
  if (journeys.length === 0) return <span className="text-tm-t3">No journeys recorded</span>;
  return (
    <>
      <span className="tm-num shrink-0 text-tm-t2">{journeys.length} {journeys.length === 1 ? "journey" : "journeys"}</span>
      {journeys.slice(0, CHIPS).map((j) => (
        <span key={j} className="max-w-[10rem] shrink-0 truncate rounded-sm border border-border px-1.5 py-px text-[11px] text-tm-t2">
          {j}
        </span>
      ))}
      {journeys.length > CHIPS && <span className="tm-num shrink-0 text-tm-t3">+{journeys.length - CHIPS}</span>}
    </>
  );
}

/** The pull requests and pushes Orbit checked: what changed, who, which journeys it exercised, and the verdict. */
export function PullRequestList({ rows, projectId }: { rows: PullRequestRow[]; projectId: string }) {
  return (
    <section aria-labelledby="pull-requests" className="flex flex-col px-5 py-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="pull-requests" className="text-[14px] font-medium">Pull requests Orbit checked</h2>
        <Link href={`/dashboard/runs?project=${projectId}`} className="text-[12px] text-tm-t2 hover:text-foreground hover:underline">
          All runs
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-pretty border-t border-border py-3 text-[13px] text-tm-t3">
          No pull requests or pushes checked yet. Install the GitHub app and every PR gets a run.{" "}
          <Link href="/dashboard/settings?tab=integrations" className="text-foreground underline-offset-2 hover:underline">
            Connect GitHub
          </Link>
        </p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.runId}>
              <TransitionLink
                href={`/dashboard/runs/${r.runId}?project=${projectId}`}
                shared={sharedName("run", r.runId)}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 border-t border-border py-3 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Status tone={r.tone} glyphOnly />
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[14px] font-medium">{r.title}</span>
                  <span className="tm-label shrink-0 text-tm-t3">{r.triggerLabel}</span>
                </span>
                <span className="tm-num text-right text-[10.5px] text-tm-t3">
                  {formatDuration(r.durationMs)} · {formatDistanceToNowStrict(new Date(r.createdAt))}
                </span>

                <span />
                <span className="flex min-w-0 items-center gap-2 overflow-hidden text-[12px]">
                  {r.author && <Avatar name={r.author.name} email={r.author.email} image={r.author.image} size="xs" />}
                  <span className="tm-label shrink-0 normal-case text-tm-t2">{r.ref}</span>
                  <span data-vt-source className="tm-label shrink-0 text-tm-t3">Run #{r.runNumber}</span>
                  <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
                    <JourneyChips journeys={r.journeys} />
                  </span>
                </span>
                <span />

                <span className="col-start-2 col-end-4 flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] sm:hidden">
                  <JourneyChips journeys={r.journeys} />
                </span>
              </TransitionLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
