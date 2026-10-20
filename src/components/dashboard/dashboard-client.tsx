"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FolderGit2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ActiveRunBar } from "@/components/dashboard/active-run-bar";
import { Button } from "@/components/ui/button";
import { useProjectEvents, type ProjectRunUpdate } from "@/hooks/use-project-events";
import { IndexingStatus } from "@/components/project/indexing-status";
import { SyncStatus, type SyncInfo } from "@/components/dashboard/sync-status";
import { NeedsYouList, ProjectTracks, RiskiestList, StatStrip } from "@/components/dashboard/home-sections";
import { homeHeadline } from "@/lib/dashboard/home-copy";
import type { NeedsYouItem, ProjectTrack, RiskyJourney } from "@/lib/dashboard/home";

interface Project {
  id: string;
  name: string;
}

interface DashboardStats {
  passRate: number;
  flakyCount: number;
  coverage: number;
  lastDuration: number;
  trends?: { passRate: number; flakyCount: number; coverage: number; duration: number };
  sparklines?: { passRate: number[]; flakyCount: number[]; coverage: number[]; duration: number[] };
}

interface ActiveRun {
  id: string;
  status: string;
  trigger: string;
  mode: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  projectId: string;
}

interface HomeRun {
  status: string;
  failed: number;
  flaky: number;
}

interface DashboardClientProps {
  activeProject: Project | null;
  recentRuns: HomeRun[];
  stats: DashboardStats;
  activeRun?: ActiveRun | null;
  indexingInfo?: { lastIndexedAt: string | null; nodeCount: number; edgeCount: number; isIndexing: boolean };
  syncInfo?: SyncInfo;
  tracks: ProjectTrack[];
  needsYou: NeedsYouItem[];
  riskiest: RiskyJourney[];
}

/** Home: one sentence of state, the stat strip, the ground tracks, then what needs you. */
export function DashboardClient({
  activeProject,
  recentRuns,
  stats,
  activeRun,
  indexingInfo,
  syncInfo,
  tracks,
  needsYou,
  riskiest,
}: DashboardClientProps) {
  const router = useRouter();
  const [liveActiveRun, setLiveActiveRun] = useState<ActiveRun | null>(null);
  // Read the clock once; the date line is not a ticking display.
  const [today] = useState(() => new Date());

  const handleRunStarted = useCallback((run: ProjectRunUpdate) => {
    setLiveActiveRun({
      id: run.runId,
      status: run.status,
      trigger: run.trigger,
      mode: run.mode,
      totalTests: run.totalTests,
      passed: 0,
      failed: 0,
      flaky: 0,
      projectId: run.projectId,
    });
  }, []);

  const handleRunCompleted = useCallback(() => {
    setLiveActiveRun(null);
    router.refresh();
  }, [router]);

  useProjectEvents({
    projectId: activeProject?.id ?? "",
    enabled: !!activeProject,
    onRunStarted: handleRunStarted,
    onRunCompleted: handleRunCompleted,
  });

  if (!activeProject) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="No projects yet"
        description="Connect a repository and Orbit maps it, plans the riskiest journeys and runs them in a real browser."
        action={
          <Button asChild>
            <Link href="/dashboard/onboarding">Connect a repository</Link>
          </Button>
        }
      />
    );
  }

  const currentActiveRun = liveActiveRun ?? activeRun ?? null;
  const t = stats.trends;
  const s = stats.sparklines;

  return (
    <div className="-mx-4 -my-4 md:-mx-6 md:-my-5 lg:-mx-8">
      <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6">
        <div className="space-y-1.5">
          <p className="tm-label text-tm-t3" suppressHydrationWarning>
            {format(today, "EEEE d MMM · HH:mm")} · {activeProject.name}
          </p>
          <h1 className="text-balance text-[28px] font-medium leading-tight tracking-display sm:text-[32px]">
            {currentActiveRun ? "A run is live now." : homeHeadline(recentRuns)}
          </h1>
          {syncInfo && <SyncStatus projectId={activeProject.id} info={syncInfo} />}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/projects/${activeProject.id}`}>Project details</Link>
        </Button>
      </header>

      {currentActiveRun && (
        <div className="px-5 pb-4">
          <ActiveRunBar initialRun={currentActiveRun} projectId={activeProject.id} />
        </div>
      )}

      <StatStrip
        stats={[
          { label: "Pass rate", value: stats.passRate, suffix: "%", trend: t?.passRate, spark: s?.passRate },
          { label: "Flaky tests", value: stats.flakyCount, trend: t?.flakyCount, upIsGood: false, spark: s?.flakyCount },
          { label: "Coverage", value: stats.coverage, suffix: "%", trend: t?.coverage, spark: s?.coverage },
          {
            label: "Last run",
            value: stats.lastDuration > 0 ? (stats.lastDuration / 1000).toFixed(1) : "–",
            suffix: stats.lastDuration > 0 ? "s" : undefined,
            trend: t?.duration,
            upIsGood: false,
            spark: s?.duration,
          },
        ]}
      />

      <div className="border-b border-border">
        <ProjectTracks tracks={tracks} activeProjectId={activeProject.id} />
      </div>

      {indexingInfo && (
        <div className="border-b border-border px-5 py-4">
          <IndexingStatus
            projectId={activeProject.id}
            lastIndexedAt={indexingInfo.lastIndexedAt}
            nodeCount={indexingInfo.nodeCount}
            edgeCount={indexingInfo.edgeCount}
            isIndexing={indexingInfo.isIndexing}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border">
        <NeedsYouList items={needsYou} projectId={activeProject.id} />
        <RiskiestList items={riskiest} />
      </div>
    </div>
  );
}
