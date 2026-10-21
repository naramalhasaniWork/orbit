import { prisma } from "@/lib/db";
import { PERSON_SELECT } from "@/lib/avatar/resolve";
import { getMapGraph } from "@/lib/map/map-data";
import type { MapEdge, MapNode } from "@/components/dashboard/map-types";
import {
  jumpFromNode,
  jumpFromPlan,
  jumpFromRun,
  journeysByRun,
  rankJumpItems,
  shapeActivity,
  shapePullRequestRows,
  ACTIVITY_VERBS,
  type ActivityRow,
  type JumpItem,
  type PullRequestRow,
} from "@/lib/dashboard/launchpad-shape";

const PR_ROWS = 8;
const ACTIVITY_ROWS = 6;
const LIVE = ["indexing", "planning", "executing", "reporting"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON = { select: PERSON_SELECT } as const;

/** The PRs and branch pushes Orbit checked, newest first, with the journeys each run exercised. Two queries. */
export async function getPullRequestRows(project: { id: string; repoOwner: string; repoName: string }): Promise<PullRequestRow[]> {
  const runs = await prisma.testRun.findMany({
    where: { projectId: project.id, trigger: { in: ["pr", "push"] } },
    orderBy: { createdAt: "desc" },
    take: PR_ROWS,
    select: {
      id: true,
      sequenceNumber: true,
      trigger: true,
      status: true,
      branch: true,
      commitSha: true,
      prNumber: true,
      failed: true,
      flaky: true,
      durationMs: true,
      createdAt: true,
      metadata: true,
      triggeredBy: PERSON,
    },
  });
  if (runs.length === 0) return [];
  const results = await prisma.testResult.findMany({
    where: { testRunId: { in: runs.map((r) => r.id) }, testCase: { journey: { not: null } } },
    select: { testRunId: true, testCase: { select: { journey: true } } },
  });
  return shapePullRequestRows(runs, journeysByRun(results), { owner: project.repoOwner, name: project.repoName });
}

/** What this person touched, and what needs them, across runs, plans and map nodes. Three queries, in parallel. */
export async function getJumpBackIn(projectId: string, userId: string | null): Promise<JumpItem[]> {
  const mine = userId ? [{ triggeredById: userId }] : [];
  const [runs, plans, nodes] = await Promise.all([
    prisma.testRun.findMany({
      where: { projectId, OR: [...mine, { status: { in: [...LIVE] } }, { status: "failed" }, { failed: { gt: 0 } }] },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, sequenceNumber: true, status: true, failed: true, flaky: true, triggeredById: true, createdAt: true },
    }),
    prisma.testPlan.findMany({
      where: { projectId, deletedAt: null, OR: [{ approvedAt: null, isActive: true }, ...(userId ? [{ approvedById: userId }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { id: true, version: true, approvedAt: true, approvedById: true, createdAt: true },
    }),
    prisma.systemMapNode.findMany({
      where: {
        projectId,
        OR: [{ metadata: { path: ["changeStatus"], equals: "added" } }, { metadata: { path: ["changeStatus"], equals: "modified" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 2,
      select: { id: true, name: true, type: true, metadata: true, updatedAt: true },
    }),
  ]);
  const uid = userId ?? "";
  return rankJumpItems([
    ...runs.map((r) => jumpFromRun(r, uid, projectId)),
    ...plans.map((p) => jumpFromPlan(p, uid, projectId)),
    ...nodes.map((n) =>
      jumpFromNode({ ...n, changeStatus: String((n.metadata as { changeStatus?: string } | null)?.changeStatus ?? "modified") }, projectId)
    ),
  ]);
}

/** Who ran what and who approved a plan, from the audit log. Empty for a one-person workspace. */
export async function getTeamActivity(workspaceId: string): Promise<ActivityRow[]> {
  const [memberCount, logs] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.auditLog.findMany({
      where: { workspaceId, action: { in: Object.keys(ACTIVITY_VERBS) } },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_ROWS,
      select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true, user: PERSON },
    }),
  ]);
  if (memberCount <= 1) return [];
  // resource_id is free text; only a uuid can be looked up against test_runs.id.
  const runIds = logs
    .filter((l) => /^(test_)?run\./.test(l.action) && UUID.test(l.resourceId ?? ""))
    .map((l) => l.resourceId as string);
  const runs = runIds.length
    ? await prisma.testRun.findMany({
        where: { id: { in: runIds }, project: { workspaceId } },
        select: { id: true, sequenceNumber: true },
      })
    : [];
  return shapeActivity(logs, new Map(runs.map((r) => [r.id, r.sequenceNumber])), memberCount);
}

export interface Launchpad {
  pullRequests: PullRequestRow[];
  jumpBackIn: JumpItem[];
  activity: ActivityRow[];
  /** The System Map for the home preview; metadata is dropped, the preview never reads it. */
  map: { nodes: MapNode[]; edges: MapEdge[] };
}

export const EMPTY_LAUNCHPAD: Launchpad = { pullRequests: [], jumpBackIn: [], activity: [], map: { nodes: [], edges: [] } };

/** Everything the launchpad shows below the stat strip, fetched in one parallel round. */
export async function getLaunchpad(
  project: { id: string; repoOwner: string; repoName: string },
  workspaceId: string,
  userId: string | null
): Promise<Launchpad> {
  const [pullRequests, jumpBackIn, activity, graph] = await Promise.all([
    getPullRequestRows(project),
    getJumpBackIn(project.id, userId),
    getTeamActivity(workspaceId),
    getMapGraph(project.id),
  ]);
  const nodes = graph.nodes.map((n) => ({ ...n, metadata: null }));
  return { pullRequests, jumpBackIn, activity, map: { nodes, edges: graph.edges } };
}
