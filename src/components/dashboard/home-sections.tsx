import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Status } from "@/components/telemetry/status";
import { GroundTrack } from "@/components/telemetry/ground-track";
import { RollingNumber } from "@/components/telemetry/rolling-number";
import { Sparkline } from "@/components/shared/sparkline";
import { toneForRun, toneForVerdict } from "@/lib/status-tone";
import { TEST_TYPE_CONFIG } from "@/components/plans/plan-types";
import type { NeedsYouItem, ProjectTrack, RiskyJourney } from "@/lib/dashboard/home";
import { cn } from "@/lib/utils";

export interface StripStat {
  label: string;
  value: number | string;
  suffix?: string;
  /** Percentage change; colour follows whether up is good. */
  trend?: number;
  upIsGood?: boolean;
  spark?: number[];
  tone?: "fail";
}

/** Row 1: the stat strip. Martian Mono numerals, hairline dividers, one cell per measure. */
export function StatStrip({ stats }: { stats: StripStat[] }) {
  return (
    <div className="grid grid-cols-2 border-y border-border md:grid-cols-4">
      {stats.map((s) => {
        const good = s.trend !== undefined && s.trend !== 0 && (s.trend > 0) === (s.upIsGood ?? true);
        return (
          <div key={s.label} className="flex flex-col gap-1.5 border-border px-5 py-4 max-md:[&:nth-child(odd)]:border-r md:[&:not(:last-child)]:border-r">
            <span className="tm-label flex items-center justify-between gap-2 text-tm-t3">
              {s.label}
              {s.spark && s.spark.length >= 2 && <Sparkline data={s.spark} width={56} height={16} strokeColor="hsl(var(--tm-t3))" />}
            </span>
            <span className={cn("tm-num text-[28px] leading-none tracking-[-0.02em]", s.tone === "fail" && "text-tm-fail")}>
              <RollingNumber value={s.value} />
              {s.suffix && <span className="text-[14px] text-tm-t3">{s.suffix}</span>}
            </span>
            {s.trend !== undefined && s.trend !== 0 && (
              <span className={cn("tm-num text-[10.5px]", good ? "text-tm-pass" : "text-tm-fail")}>
                <span aria-hidden="true">{s.trend > 0 ? "▲" : "▼"} </span>
                <span className="sr-only">{s.trend > 0 ? "up" : "down"} </span>
                {Math.abs(s.trend).toFixed(1)}% vs prior week
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Row 2: one ground track per project, one tick per run in the last 14 days. */
export function ProjectTracks({ tracks, activeProjectId }: { tracks: ProjectTrack[]; activeProjectId: string }) {
  return (
    <section aria-labelledby="tracks" className="space-y-3 px-5 py-5">
      <div className="flex items-baseline justify-between">
        <h2 id="tracks" className="text-[14px] font-medium">Ground track · last 14 days</h2>
        <span className="tm-label text-tm-t3">One tick per run</span>
      </div>
      {tracks.length === 0 ? (
        <p className="text-[13px] text-tm-t3">No runs in the last 14 days.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3">
          {tracks.map((t) => (
            <div key={t.projectId} className="contents">
              <Link
                href={`/dashboard?project=${t.projectId}`}
                className={cn("truncate text-[13px] hover:underline", t.projectId === activeProjectId ? "font-medium" : "text-tm-t2")}
              >
                {t.projectName}
              </Link>
              <GroundTrack ticks={t.runs.map((r) => ({ tone: toneForRun(r.status, r) }))} noun="runs" />
              <span className="tm-num text-[10.5px] text-tm-t3">{t.runs.length}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Row 3, left: what failed last time, with the cause in plain English as the second line. */
export function NeedsYouList({
  items,
  projectId,
  runNumber,
}: {
  items: NeedsYouItem[];
  projectId: string;
  /** The latest finished run: the same run as the pass rate and the headline. */
  runNumber: number | null;
}) {
  return (
    <section aria-labelledby="needs-you" className="flex flex-col px-5 py-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="needs-you" className="text-[14px] font-medium">Needs you</h2>
        <Link href={`/dashboard/runs?project=${projectId}&status=failed`} className="text-[12px] text-tm-t2 hover:text-foreground hover:underline">
          All failures
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="border-t border-border py-3 text-[13px] text-tm-t3">
          {runNumber ? `Nothing failed on run #${runNumber}, the latest finished run.` : "No finished runs yet."}
        </p>
      ) : (
        items.map((i) => (
          <Link
            key={i.resultId}
            href={`/dashboard/runs/${i.runId}?project=${projectId}`}
            className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 border-t border-border py-3 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Status tone={toneForVerdict(i.verdict)} glyphOnly />
            <span className="truncate text-[14px] font-medium">{i.testName}</span>
            <span className="tm-label text-tm-t3">
              Run #{i.runNumber} · {formatDistanceToNowStrict(new Date(i.createdAt))}
            </span>
            {i.cause && (
              <>
                <span />
                <span className="col-span-2 line-clamp-2 text-pretty text-[13px] leading-snug text-tm-t2">{i.cause}</span>
              </>
            )}
          </Link>
        ))
      )}
    </section>
  );
}

/** Row 3, right: planned tests that have never run, riskiest first. */
export function RiskiestList({ items }: { items: RiskyJourney[] }) {
  return (
    <section aria-labelledby="riskiest" className="flex flex-col px-5 py-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="riskiest" className="text-[14px] font-medium">Riskiest untested journeys</h2>
        <Link href="/dashboard/plans" className="text-[12px] text-tm-t2 hover:text-foreground hover:underline">
          Plan them
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="border-t border-border py-3 text-[13px] text-tm-t3">Every planned test has run at least once.</p>
      ) : (
        <ol>
          {items.map((j, n) => (
            <li key={j.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border py-2.5 text-[14px]">
              <span className="tm-num text-[11px] text-tm-t3">{String(n + 1).padStart(2, "0")}</span>
              <span className="truncate">{j.journey ? `${j.journey} · ${j.name}` : j.name}</span>
              <span className="tm-label text-tm-t2">{TEST_TYPE_CONFIG[j.type]?.label ?? j.type}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
