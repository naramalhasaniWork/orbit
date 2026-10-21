"use client";

import { useRouter } from "next/navigation";
import { Status } from "@/components/telemetry/status";
import { LayeredMap } from "@/components/dashboard/layered-map";
import { StatStrip } from "@/components/dashboard/home-sections";
import { toneForHealth, toneForRun } from "@/lib/status-tone";
import { MODE_LABELS, TRIGGER_LABELS } from "@/components/runs/run-types";
import { EmptyState } from "@/components/shared/empty-state";
import { IndexingStatusPanel } from "@/components/projects/indexing-status-panel";
import {
  GitBranch,
  ExternalLink,
  TestTube2,
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

/** Project overview: identity, counts, index, a window onto the layered map, recent runs. */
export function ProjectDetailClient({
  project,
  recentRuns,
  mapNodes,
  mapEdges,
}: ProjectDetailClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-balance text-[26px] font-medium leading-tight tracking-display">{project.name}</h1>
          <Status tone={toneForHealth(project.healthStatus)} label={project.healthStatus} mono />
          {project.framework && <span className="tm-label rounded-sm border border-border px-1.5 text-tm-t2">{project.framework}</span>}
        </div>
        <p className="tm-label flex flex-wrap items-center gap-x-2 text-tm-t3">
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 normal-case text-tm-t2 hover:text-foreground hover:underline"
          >
            <GitBranch aria-hidden="true" className="size-3" />
            {project.repoOwner}/{project.repoName}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
          <span className="normal-case">· {project.defaultBranch}</span>
          <span className="normal-case">· created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}</span>
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <StatStrip
          stats={[
            { label: "Nodes", value: project.nodeCount },
            { label: "Edges", value: project.edgeCount },
            { label: "Test cases", value: project.testCaseCount },
            { label: "Runs", value: project.testRunCount },
          ]}
        />
      </div>

      <IndexingStatusPanel
        projectId={project.id}
        lastIndexedAt={project.lastIndexedAt}
        nodeCount={project.nodeCount}
        edgeCount={project.edgeCount}
        onReindexComplete={() => router.refresh()}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section aria-labelledby="map-preview" className="overflow-hidden rounded-lg border border-border bg-card lg:col-span-3">
          <div className="flex h-10 items-center justify-between border-b border-border px-4">
            <h2 id="map-preview" className="text-[13px] font-medium">System Map</h2>
            <Link href={`/dashboard/map?project=${project.id}`} className="inline-flex items-center gap-1 text-[12px] text-tm-t2 hover:text-foreground hover:underline">
              Full view <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          </div>
          <div className="h-[320px] overflow-auto">
            {mapNodes.length > 0 ? (
              <LayeredMap
                nodes={mapNodes}
                edges={mapEdges}
                selectedId={null}
                mode="journey"
                onSelect={(id) => id && router.push(`/dashboard/map?project=${project.id}&node=${id}`)}
              />
            ) : (
              <p className="p-4 text-[13px] text-tm-t3">No system map yet. Re-index to map the repository.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="recent-runs" className="overflow-hidden rounded-lg border border-border bg-card lg:col-span-2">
          <div className="flex h-10 items-center justify-between border-b border-border px-4">
            <h2 id="recent-runs" className="text-[13px] font-medium">Recent runs</h2>
            <Link href={`/dashboard/runs?project=${project.id}`} className="text-[12px] text-tm-t2 hover:text-foreground hover:underline">
              View all
            </Link>
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState icon={TestTube2} title="No runs yet" description="Run the plan to see results here." className="py-8" />
          ) : (
            <ul>
              {recentRuns.map((run) => (
                <RecentRunRow key={run.id} run={run} projectId={project.id} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function RecentRunRow({ run, projectId }: { run: RecentRun; projectId: string }) {
  const tone = toneForRun(run.status, run);
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/dashboard/runs/${run.id}?project=${projectId}`}
        className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Status tone={tone} glyphOnly />
        <span className="min-w-0">
          <span className="block truncate text-[13px]">{formatRunTitle(run)}</span>
          <span className="tm-label block truncate text-tm-t3">
            {TRIGGER_LABELS[run.trigger] ?? run.trigger} · {MODE_LABELS[run.mode] ?? run.mode}
            <span className="normal-case"> · {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</span>
          </span>
        </span>
        <span className="tm-num flex gap-2 text-[10.5px]">
          {run.passed > 0 && <span className="text-tm-pass"><span aria-hidden="true">✓</span>{run.passed}<span className="sr-only"> passed</span></span>}
          {run.failed > 0 && <span className="text-tm-fail"><span aria-hidden="true">✕</span>{run.failed}<span className="sr-only"> failed</span></span>}
          {run.flaky > 0 && <span className="text-tm-flaky"><span aria-hidden="true">◐</span>{run.flaky}<span className="sr-only"> flaky</span></span>}
        </span>
      </Link>
    </li>
  );
}
