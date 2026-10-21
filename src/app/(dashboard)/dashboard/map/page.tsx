import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseProjectSettings } from "@/server/data/settings-repo";
import { Network } from "lucide-react";
import { SystemMapView } from "@/components/dashboard/system-map-view";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { MapNode, MapEdge, TestStatus, ChangeStatus } from "@/components/dashboard/map-types";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const params = await searchParams;

  let project: { id: string; name: string } | null = null;

  if (params.project) {
    project = await prisma.project.findFirst({
      where: { id: params.project, workspaceId },
      select: { id: true, name: true },
    });
  }

  if (!project) {
    project = await prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
  }

  if (!project) redirect("/dashboard");

  const projectSettings = await prisma.project.findUnique({
    where: { id: project.id },
    select: { settings: true },
  });
  const settings = parseProjectSettings(projectSettings?.settings);
  const syncDiff = settings.lastSyncDiff;
  const commitsBehind = settings.commitsBehind ?? 0;
  const lastCommitSha = settings.lastCommitSha;
  const lastCommitMessage = settings.lastCommitMessage;

  const [dbNodes, dbEdges] = await Promise.all([
    prisma.systemMapNode.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        type: true,
        name: true,
        filePath: true,
        metadata: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.systemMapEdge.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        sourceNodeId: true,
        targetNodeId: true,
        relationship: true,
      },
    }),
  ]);

  // Determine test status per node from latest test results
  const nodeTestStatuses = await getNodeTestStatuses(project.id);

  const nodes: MapNode[] = dbNodes.map((n) => {
    const meta = n.metadata as Record<string, unknown> | null;
    return {
      id: n.id,
      type: n.type as MapNode["type"],
      name: n.name,
      filePath: n.filePath,
      metadata: meta,
      testStatus: nodeTestStatuses.get(n.id) ?? ("untested" as TestStatus),
      changeStatus: (meta?.changeStatus as ChangeStatus) ?? undefined,
    };
  });

  const edges: MapEdge[] = dbEdges.map((e) => ({
    id: e.id,
    sourceId: e.sourceNodeId,
    targetId: e.targetNodeId,
    relationship: e.relationship,
  }));

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[480px] flex-col">
      <div className="flex items-center justify-between px-1 pb-3">
        <div>
          <h1 className="text-[26px] font-medium leading-tight tracking-display">System Map</h1>
          <p className="tm-label mt-1 flex flex-wrap items-center gap-2 text-tm-t3">
            <span>{project.name} · {nodes.length} nodes · {edges.length} edges</span>
            {syncDiff && (syncDiff.added > 0 || syncDiff.modified > 0 || syncDiff.removed > 0) && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/40">·</span>
                {syncDiff.added > 0 && <span className="text-tm-info">+{syncDiff.added} new</span>}
                {syncDiff.added > 0 && syncDiff.modified > 0 && <span className="text-muted-foreground/40"> · </span>}
                {syncDiff.modified > 0 && <span className="text-tm-t2">~{syncDiff.modified} changed</span>}
                {(syncDiff.added > 0 || syncDiff.modified > 0) && syncDiff.removed > 0 && <span className="text-muted-foreground/40"> · </span>}
                {syncDiff.removed > 0 && <span className="text-tm-fail">-{syncDiff.removed} removed</span>}
              </span>
            )}
            {commitsBehind > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-tm-warn/10 text-tm-warn border border-tm-warn/20 text-[10px]">
                ↑ {commitsBehind} commit{commitsBehind !== 1 ? "s" : ""} ahead on GitHub
                {lastCommitSha && (
                  <span className="font-mono opacity-70">{lastCommitSha.slice(0, 7)}</span>
                )}
                {lastCommitMessage && (
                  <span className="hidden sm:inline opacity-70 truncate max-w-[200px]">— {lastCommitMessage}</span>
                )}
              </span>
            )}
          </p>
        </div>
      </div>
      {nodes.length === 0 ? (
        <EmptyState
          icon={Network}
          title="The map is empty"
          description="Index the repository and Orbit draws every route, component, API and data model, and how they connect."
          action={
            <Button asChild>
              <Link href={`/dashboard/onboarding?project=${project.id}&step=2`}>Index the repository</Link>
            </Button>
          }
          className="flex-1 rounded-lg border border-border bg-card"
        />
      ) : (
        <SystemMapView nodes={nodes} edges={edges} />
      )}
    </div>
  );
}

async function getNodeTestStatuses(
  projectId: string
): Promise<Map<string, TestStatus>> {
  const statuses = new Map<string, TestStatus>();

  // Get test cases with their journeys and latest verdicts
  const testCases = await prisma.testCase.findMany({
    where: { projectId, isEnabled: true },
    select: {
      journey: true,
      lastVerdict: true,
    },
  });

  // Map journeys to verdict summaries
  const journeyVerdicts = new Map<string, Set<string>>();
  for (const tc of testCases) {
    if (!tc.journey) continue;
    const verdicts = journeyVerdicts.get(tc.journey) ?? new Set<string>();
    if (tc.lastVerdict) verdicts.add(tc.lastVerdict);
    journeyVerdicts.set(tc.journey, verdicts);
  }

  // Get nodes and match to journeys by name
  const nodes = await prisma.systemMapNode.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });

  for (const node of nodes) {
    const verdicts = journeyVerdicts.get(node.name);
    if (!verdicts || verdicts.size === 0) {
      statuses.set(node.id, "untested");
      continue;
    }

    if (verdicts.has("fail")) {
      statuses.set(node.id, "fail");
    } else if (verdicts.has("flaky")) {
      statuses.set(node.id, "flaky");
    } else if (verdicts.has("pass") || verdicts.has("healed")) {
      statuses.set(node.id, "pass");
    } else {
      statuses.set(node.id, "untested");
    }
  }

  return statuses;
}
