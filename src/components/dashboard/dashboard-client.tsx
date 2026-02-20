"use client";

import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RunsTimeline } from "@/components/dashboard/runs-timeline";
import { ActiveRunBar } from "@/components/dashboard/active-run-bar";
import { SystemMap } from "@/components/dashboard/system-map";
import { Button } from "@/components/ui/button";
import { FolderGit2, Play } from "lucide-react";
import Link from "next/link";
import type { MapNode, MapEdge } from "@/components/dashboard/map-types";

interface Project {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  healthStatus: string;
  _count: { testRuns: number; testCases: number };
}

interface Run {
  id: string;
  status: string;
  mode: string;
  trigger: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  durationMs: number | null;
  createdAt: Date;
}

interface DashboardTrends {
  passRate: number;
  flakyCount: number;
  coverage: number;
  duration: number;
}

interface DashboardSparklines {
  passRate: number[];
  flakyCount: number[];
  coverage: number[];
  duration: number[];
}

interface DashboardStats {
  passRate: number;
  flakyCount: number;
  coverage: number;
  lastDuration: number;
  trends?: DashboardTrends;
  sparklines?: DashboardSparklines;
}

interface ActiveRun {
  id: string;
  status: string;
  trigger: string;
  mode: string;
  totalTests: number;
  passed: number;
  failed: number;
  projectId: string;
}

interface DashboardClientProps {
  projects: Project[];
  activeProject: Project | null;
  recentRuns: Run[];
  stats: DashboardStats;
  activeRun?: ActiveRun | null;
  mapNodes?: MapNode[];
  mapEdges?: MapEdge[];
}

export function DashboardClient({
  projects,
  activeProject,
  recentRuns,
  stats,
  activeRun,
  mapNodes = [],
  mapEdges = [],
}: DashboardClientProps) {
  if (!activeProject) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="No projects yet"
        description="Connect your first repository to get started with AI-powered testing."
        action={
          <Link href="/dashboard/onboarding">
            <Button className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2">
              <Play className="h-4 w-4" />
              Connect Repository
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {activeRun && (
        <ActiveRunBar initialRun={activeRun} projectId={activeProject.id} />
      )}

      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Pass Rate"
          value={stats.passRate}
          suffix="%"
          trend={stats.trends?.passRate}
          sparklineData={stats.sparklines?.passRate}
          sparklineColor="hsl(var(--orbit-pass))"
        />
        <StatCard
          label="Flaky Tests"
          value={stats.flakyCount}
          trend={stats.trends?.flakyCount}
          trendInverted
          sparklineData={stats.sparklines?.flakyCount}
          sparklineColor="hsl(var(--orbit-flaky))"
        />
        <StatCard
          label="Coverage"
          value={stats.coverage}
          suffix="%"
          trend={stats.trends?.coverage}
          sparklineData={stats.sparklines?.coverage}
          sparklineColor="hsl(var(--orbit-accent))"
        />
        <StatCard
          label="Last Duration"
          value={stats.lastDuration > 0 ? `${(stats.lastDuration / 1000).toFixed(1)}` : "--"}
          suffix={stats.lastDuration > 0 ? "s" : ""}
          trend={stats.trends?.duration}
          trendInverted
          sparklineData={stats.sparklines?.duration}
          sparklineColor="hsl(var(--orbit-untested))"
        />
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 rounded-xl surface-1 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-foreground">System Map</h2>
            <Link
              href="/dashboard/map"
              className="text-xs text-orbit-accent hover:text-orbit-accent/80 transition-colors"
            >
              Full view
            </Link>
          </div>
          <div className="h-[400px] rounded-lg overflow-hidden">
            {mapNodes.length > 0 ? (
              <SystemMap nodes={mapNodes} edges={mapEdges} compact />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-[13px]">
                No system map data yet. Run indexing to generate.
              </div>
            )}
          </div>
        </div>

        <div className="col-span-2">
          <RunsTimeline runs={recentRuns} />
        </div>
      </div>
    </div>
  );
}
