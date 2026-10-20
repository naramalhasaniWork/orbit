"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";
import { SystemMap } from "@/components/dashboard/system-map";
import { EmptyState } from "@/components/shared/empty-state";
import { IndexingStatusPanel } from "@/components/projects/indexing-status-panel";
import {
  GitBranch,
  ExternalLink,
  Map as MapIcon,
  TestTube2,
  FileText,
  Layers,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { formatRunTitle } from "@/lib/runs/run-title";
import type { MapNode, MapEdge } from "@/components/dashboard/map-types";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  framework: string | null;
  healthStatus: string;
  lastIndexedAt: Date | null;
  lastRunAt: Date | null;
  onboardingCompleted: boolean;
  createdAt: Date;
  nodeCount: number;
  edgeCount: number;
  testCaseCount: number;
  testRunCount: number;
}

interface RecentRun {
  id: string;
  sequenceNumber: number;
  prNumber: number | null;
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

interface ProjectDetailClientProps {
  project: ProjectData;
  recentRuns: RecentRun[];
  mapNodes: MapNode[];
  mapEdges: MapEdge[];
}

// ------------------------------------------------------------------
// Animation variants
// ------------------------------------------------------------------

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

const healthDot: Record<string, "pass" | "fail" | "flaky" | "untested"> = {
  healthy: "pass",
  degraded: "flaky",
  failing: "fail",
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function ProjectDetailClient({
  project,
  recentRuns,
  mapNodes,
  mapEdges,
}: ProjectDetailClientProps) {
  const router = useRouter();

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-6xl"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-medium text-foreground">
              {project.name}
            </h1>
            <StatusDot
              status={healthDot[project.healthStatus] ?? "untested"}
            />
            {project.framework && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {project.framework}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" />
              {project.repoOwner}/{project.repoName}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-muted-foreground/40">|</span>
            <span>{project.defaultBranch}</span>
            <span className="text-muted-foreground/40">|</span>
            <span>
              Created{" "}
              {formatDistanceToNow(new Date(project.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat
          icon={Layers}
          label="Nodes"
          value={project.nodeCount}
          href={`/dashboard/map?project=${project.id}`}
        />
        <MiniStat
          icon={GitBranch}
          label="Edges"
          value={project.edgeCount}
        />
        <MiniStat
          icon={TestTube2}
          label="Test Cases"
          value={project.testCaseCount}
          href={`/dashboard/plans?project=${project.id}`}
        />
        <MiniStat
          icon={FileText}
          label="Runs"
          value={project.testRunCount}
          href={`/dashboard/runs?project=${project.id}`}
        />
      </motion.div>

      {/* Indexing status panel */}
      <motion.div variants={fadeUp}>
        <IndexingStatusPanel
          projectId={project.id}
          lastIndexedAt={project.lastIndexedAt}
          nodeCount={project.nodeCount}
          edgeCount={project.edgeCount}
          onReindexComplete={() => router.refresh()}
        />
      </motion.div>

      {/* System Map preview + Recent Runs */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* System Map */}
        <div className="lg:col-span-3 rounded-xl surface-1 border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-foreground flex items-center gap-2">
              <MapIcon className="h-3.5 w-3.5 text-muted-foreground" />
              System Map
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {project.nodeCount} nodes / {project.edgeCount} edges
              </span>
              <Link
                href={`/dashboard/map?project=${project.id}`}
                className="text-xs text-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                Full view
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="h-[300px] rounded-lg overflow-hidden">
            {mapNodes.length > 0 ? (
              <SystemMap nodes={mapNodes} edges={mapEdges} compact />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-[13px]">
                No system map data yet. Run indexing to generate.
              </div>
            )}
          </div>
        </div>

        {/* Recent Runs */}
        <div className="lg:col-span-2 rounded-xl surface-1 border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-foreground">
              Recent Runs
            </h2>
            <Link
              href={`/dashboard/runs?project=${project.id}`}
              className="text-xs text-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          </div>

          {recentRuns.length === 0 ? (
            <EmptyState
              icon={TestTube2}
              title="No runs yet"
              description="Trigger a test run to see results here."
              className="py-8"
            />
          ) : (
            <div className="space-y-1">
              {recentRuns.map((run) => (
                <RunRow key={run.id} run={run} projectId={project.id} />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function MiniStat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl surface-1 border border-border",
        href && "hover:border-muted-foreground/20 transition-all duration-200 cursor-pointer"
      )}
    >
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted/30">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <span className="text-lg font-medium tabular-nums text-foreground block leading-tight">
          {value}
        </span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function RunRow({ run, projectId }: { run: RecentRun; projectId: string }) {
  const status =
    run.status === "executing" || run.status === "indexing" || run.status === "planning"
      ? "running"
      : run.failed > 0
        ? "fail"
        : run.flaky > 0
          ? "flaky"
          : run.passed > 0
            ? "pass"
            : "untested";

  return (
    <Link
      href={`/dashboard/runs/${run.id}?project=${projectId}`}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/20 transition-colors"
    >
      <StatusDot status={status} pulse={status === "running"} />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground">
          {formatRunTitle(run)}
        </span>
        <span className="text-xs text-muted-foreground block">
          {run.mode} {run.trigger} · {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs tabular-nums">
        {run.passed > 0 && <span className="text-orbit-pass">{run.passed}</span>}
        {run.failed > 0 && <span className="text-orbit-fail">{run.failed}</span>}
        {run.flaky > 0 && <span className="text-orbit-flaky">{run.flaky}</span>}
      </div>
    </Link>
  );
}
