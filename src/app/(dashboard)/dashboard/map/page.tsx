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
import { getMapGraph } from "@/lib/map/map-data";

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

  const { nodes, edges } = await getMapGraph(project.id);

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

