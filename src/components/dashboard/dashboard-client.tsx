"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  staggerContainer,
  staggerItem,
  staggerScaleItem,
  scaleIn,
} from "@/lib/motion";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RunsTimeline } from "@/components/dashboard/runs-timeline";
import { ActiveRunBar } from "@/components/dashboard/active-run-bar";
import { SystemMap } from "@/components/dashboard/system-map";
import { Button } from "@/components/ui/button";
import { FolderGit2, Play, Plus, GitBranch, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { MapNode, MapEdge } from "@/components/dashboard/map-types";
import { useProjectEvents, type ProjectRunUpdate } from "@/hooks/use-project-events";
import { IndexingStatus } from "@/components/project/indexing-status";

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
  flaky: number;
  projectId: string;
}

interface IndexingInfo {
  lastIndexedAt: string | null;
  nodeCount: number;
  edgeCount: number;
  isIndexing: boolean;
}

interface SyncInfo {
  commitsBehind: number;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  syncDiff: { added: number; modified: number; removed: number } | null;
}

interface DashboardClientProps {
  projects: Project[];
  activeProject: Project | null;
  recentRuns: Run[];
  stats: DashboardStats;
  activeRun?: ActiveRun | null;
  mapNodes?: MapNode[];
  mapEdges?: MapEdge[];
  indexingInfo?: IndexingInfo;
  syncInfo?: SyncInfo;
}

const stagger = staggerContainer(0.06);
const fadeUp = staggerItem;
const cardItem = staggerScaleItem;

export function DashboardClient({
  projects,
  activeProject,
  recentRuns,
  stats,
  activeRun,
  mapNodes = [],
  mapEdges = [],
  indexingInfo,
  syncInfo,
}: DashboardClientProps) {
  const router = useRouter();
  const [liveActiveRun, setLiveActiveRun] = useState<ActiveRun | null>(null);

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
    // Refresh server data to update stats and timeline
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

  // Show live active run if one started via SSE, otherwise use server-provided
  const currentActiveRun = liveActiveRun ?? activeRun ?? null;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={fadeUp} className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground">{activeProject.name}</h1>
          <Link
            href={`/dashboard/projects/${activeProject.id}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View details
          </Link>
          {syncInfo && syncInfo.commitsBehind > 0 && (
            <Link
              href={`/dashboard/map?project=${activeProject.id}`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/15 transition-colors"
            >
              <GitBranch className="h-3 w-3" />
              {syncInfo.commitsBehind} commit{syncInfo.commitsBehind !== 1 ? "s" : ""} ahead on GitHub
              {syncInfo.lastCommitSha && (
                <span className="font-mono opacity-70">{syncInfo.lastCommitSha.slice(0, 7)}</span>
              )}
            </Link>
          )}
          {syncInfo?.syncDiff && (syncInfo.syncDiff.added > 0 || syncInfo.syncDiff.modified > 0 || syncInfo.syncDiff.removed > 0) && (
            <span className="flex items-center gap-1 text-[11px]">
              {syncInfo.syncDiff.added > 0 && <span className="text-blue-400">+{syncInfo.syncDiff.added}</span>}
              {syncInfo.syncDiff.modified > 0 && <span className="text-purple-400">~{syncInfo.syncDiff.modified}</span>}
              {syncInfo.syncDiff.removed > 0 && <span className="text-red-400">-{syncInfo.syncDiff.removed}</span>}
              <span className="text-muted-foreground">since last sync</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {syncInfo && syncInfo.commitsBehind > 0 && activeProject && (
            <Link href={`/dashboard/settings?project=${activeProject.id}&tab=general`}>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs gap-1.5 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              >
                <RefreshCw className="h-3 w-3" />
                Sync Now
              </Button>
            </Link>
          )}
          <Link href="/dashboard/onboarding">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 border-border hover:bg-white/[0.06]"
            >
              <Plus className="h-3 w-3" />
              New Project
            </Button>
          </Link>
        </div>
      </motion.div>

      {currentActiveRun && (
        <motion.div variants={fadeUp}>
          <ActiveRunBar initialRun={currentActiveRun} projectId={activeProject.id} />
        </motion.div>
      )}

      <motion.div
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <motion.div variants={cardItem}>
          <StatCard
            label="Pass Rate"
            value={stats.passRate}
            suffix="%"
            trend={stats.trends?.passRate}
            sparklineData={stats.sparklines?.passRate}
            sparklineColor="hsl(var(--orbit-pass))"
          />
        </motion.div>
        <motion.div variants={cardItem}>
          <StatCard
            label="Flaky Tests"
            value={stats.flakyCount}
            trend={stats.trends?.flakyCount}
            trendInverted
            sparklineData={stats.sparklines?.flakyCount}
            sparklineColor="hsl(var(--orbit-flaky))"
          />
        </motion.div>
        <motion.div variants={cardItem}>
          <StatCard
            label="Coverage"
            value={stats.coverage}
            suffix="%"
            trend={stats.trends?.coverage}
            sparklineData={stats.sparklines?.coverage}
            sparklineColor="hsl(var(--orbit-accent))"
          />
        </motion.div>
        <motion.div variants={cardItem}>
          <StatCard
            label="Last Duration"
            value={stats.lastDuration > 0 ? `${(stats.lastDuration / 1000).toFixed(1)}` : "--"}
            suffix={stats.lastDuration > 0 ? "s" : ""}
            trend={stats.trends?.duration}
            trendInverted
            sparklineData={stats.sparklines?.duration}
            sparklineColor="hsl(var(--orbit-untested))"
          />
        </motion.div>
      </motion.div>

      {indexingInfo && (
        <motion.div variants={fadeUp}>
          <IndexingStatus
            projectId={activeProject.id}
            lastIndexedAt={indexingInfo.lastIndexedAt}
            nodeCount={indexingInfo.nodeCount}
            edgeCount={indexingInfo.edgeCount}
            isIndexing={indexingInfo.isIndexing}
          />
        </motion.div>
      )}

      <motion.div
        variants={scaleIn}
        className="grid grid-cols-1 lg:grid-cols-5 gap-4"
      >
        <div className="lg:col-span-3 rounded-xl surface-1 border border-border p-5">
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

        <div className="lg:col-span-2">
          <RunsTimeline runs={recentRuns} />
        </div>
      </motion.div>
    </motion.div>
  );
}
