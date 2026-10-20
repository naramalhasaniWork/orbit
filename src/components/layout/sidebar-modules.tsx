"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { useProjects } from "@/hooks/use-projects";
import type { ActiveOperation } from "@/lib/dashboard/active-operations";
import { ageShort, clock } from "@/lib/telemetry-format";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/telemetry/live-dot";
import { Status } from "@/components/telemetry/status";
import { GroundTrack } from "@/components/telemetry/ground-track";
import { needsYou, stripTicks, STRIP_RUNS, type ProjectRuns, type SidebarRun } from "./sidebar-data";

const PINNED_PROJECTS = 4;

/** Matter ModuleCard: quiet fill, heading links to the full page, compact real-data body. */
function ModuleCard({
  title,
  href,
  meta,
  live = false,
  children,
}: {
  title: string;
  href: string;
  meta?: React.ReactNode;
  live?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card">
      <div className="flex h-9 items-center justify-between gap-2 px-3">
        <Link
          href={href}
          className="rounded-sm text-[12px] font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title}
        </Link>
        {meta !== undefined && (
          <span className={cn("tm-label", live ? "text-tm-live-text" : "text-tm-t3")}>{meta}</span>
        )}
      </div>
      {children && <div className="border-t border-border px-1 py-1">{children}</div>}
    </section>
  );
}

const ROW = "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Running work, from the same poll the activity bar uses. Hidden when nothing is live. */
export function LiveModule({ operations, now }: { operations: ActiveOperation[]; now: number }) {
  if (operations.length === 0) return null;
  return (
    <ModuleCard title="Live" href="/dashboard/runs" meta={`${operations.length} running`} live>
      {operations.slice(0, 6).map((op) => {
        const total = Number(op.meta?.totalTests ?? 0);
        const done = Number(op.meta?.passed ?? 0) + Number(op.meta?.failed ?? 0);
        const href = op.type === "run" ? `/dashboard/runs/${op.id}?project=${op.projectId}` : `/dashboard?project=${op.projectId}`;
        return (
          <Link key={op.id} href={href} className={ROW}>
            <LiveDot size="sm" />
            <span className="min-w-0 flex-1 truncate">
              {op.projectName} <span className="text-tm-t3">· {op.label}</span>
            </span>
            <span className="tm-num shrink-0 text-[10.5px] text-tm-t2">
              {total > 0 ? `${done}/${total}` : op.progress !== null ? `${op.progress}%` : ""}
              {op.startedAt ? ` · ${clock(now - Date.parse(op.startedAt))}` : ""}
            </span>
          </Link>
        );
      })}
    </ModuleCard>
  );
}

async function fetchProjectRuns(ids: string[], names: Record<string, string>): Promise<ProjectRuns[]> {
  return Promise.all(
    ids.map(async (id) => ({
      projectId: id,
      projectName: names[id],
      runs: await fetcher<SidebarRun[]>(`/api/projects/${id}/runs`),
    }))
  );
}

/** Pinned projects' recent runs: feeds both the Projects strips and Needs you. */
function usePinnedRuns() {
  const { projects } = useProjects();
  const pinned = projects.filter((p) => p.status === "active" && p.onboardingCompleted).slice(0, PINNED_PROJECTS);
  const ids = pinned.map((p) => p.id);
  const names = Object.fromEntries(pinned.map((p) => [p.id, p.name]));
  const { data, isLoading } = useSWR(ids.length ? ["sidebar-runs", ...ids] : null, () => fetchProjectRuns(ids, names), {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });
  return { pinned, data: data ?? [], isLoading, hasProjects: projects.length > 0 };
}

export function RunModules({ now }: { now: number }) {
  const { pinned, data, isLoading, hasProjects } = usePinnedRuns();
  const rows = needsYou(data);
  const byId = new Map(data.map((d) => [d.projectId, d.runs]));

  return (
    <>
      <ModuleCard title="Needs you" href="/dashboard/runs?status=failed" meta={isLoading ? undefined : rows.length}>
        {!isLoading && hasProjects && (
          rows.length === 0 ? (
            <p className="px-2 py-1.5 text-[13px] text-tm-t3">Nothing to triage.</p>
          ) : (
            rows.map((r) => (
              <Link key={r.runId} href={`/dashboard/runs/${r.runId}?project=${r.projectId}`} className={ROW}>
                <Status tone={r.tone} glyphOnly />
                <span className="min-w-0 flex-1 truncate">
                  {r.projectName}{" "}
                  <span className="text-tm-t3">
                    · {r.count} {r.tone === "fail" ? "failed" : "flaky"}
                  </span>
                </span>
                <span className="tm-num shrink-0 text-[10.5px] text-tm-t3">{ageShort(Date.parse(r.createdAt), now)}</span>
              </Link>
            ))
          )
        )}
      </ModuleCard>

      <ModuleCard title="Projects" href="/dashboard/projects" meta={pinned.length || undefined}>
        {pinned.map((p) => (
          <Link key={p.id} href={`/dashboard?project=${p.id}`} className={cn(ROW, "h-auto flex-col items-stretch gap-1 py-1.5")}>
            <span className="truncate">{p.name}</span>
            <GroundTrack
              ticks={stripTicks(byId.get(p.id) ?? [])}
              slots={STRIP_RUNS}
              noun="recent runs"
            />
          </Link>
        ))}
      </ModuleCard>

      {/* No client API exposes coverage yet; the module is a heading that links to the map. */}
      <ModuleCard title="Coverage" href="/dashboard/map" />
    </>
  );
}
