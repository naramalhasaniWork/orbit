import { prisma } from "@/lib/db";
import { firstSentence } from "@/lib/dashboard/home-copy";

const DAY_MS = 86_400_000;

export interface ProjectTrack {
  projectId: string;
  projectName: string;
  /** Oldest first. */
  runs: { id: string; status: string; failed: number; flaky: number }[];
}

export interface NeedsYouItem {
  resultId: string;
  runId: string;
  runNumber: number;
  verdict: string;
  testName: string;
  cause: string | null;
  createdAt: string;
}

export interface RiskyJourney {
  id: string;
  name: string;
  journey: string | null;
  type: string;
  priorityScore: number;
}

/** Every run in the last 14 days, per project: the ground track rows on the home page. */
export async function getProjectTracks(workspaceId: string, now = Date.now()): Promise<ProjectTrack[]> {
  const runs = await prisma.testRun.findMany({
    where: { project: { workspaceId }, createdAt: { gte: new Date(now - 14 * DAY_MS) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, failed: true, flaky: true, project: { select: { id: true, name: true } } },
  });
  const byProject = new Map<string, ProjectTrack>();
  for (const r of runs) {
    const track = byProject.get(r.project.id) ?? { projectId: r.project.id, projectName: r.project.name, runs: [] };
    track.runs.push({ id: r.id, status: r.status, failed: r.failed, flaky: r.flaky });
    byProject.set(r.project.id, track);
  }
  return Array.from(byProject.values());
}

/** Failures and flakes of the project's latest finished run, with the plain-English cause. */
export async function getNeedsYou(projectId: string): Promise<NeedsYouItem[]> {
  const latest = await prisma.testRun.findFirst({
    where: { projectId, status: { in: ["completed", "failed"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, sequenceNumber: true, createdAt: true },
  });
  if (!latest) return [];
  const results = await prisma.testResult.findMany({
    where: { testRunId: latest.id, verdict: { in: ["fail", "environment_error", "flaky"] } },
    orderBy: { verdict: "asc" },
    take: 6,
    select: { id: true, verdict: true, failureExplanation: true, testCase: { select: { name: true } } },
  });
  return results.map((r) => ({
    resultId: r.id,
    runId: latest.id,
    runNumber: latest.sequenceNumber,
    verdict: r.verdict,
    testName: r.testCase.name,
    cause: firstSentence(r.failureExplanation),
    createdAt: latest.createdAt.toISOString(),
  }));
}

/** Planned tests that have never run, riskiest first. */
export async function getRiskiestUntested(projectId: string): Promise<RiskyJourney[]> {
  return prisma.testCase.findMany({
    where: { projectId, lastRunAt: null, isEnabled: true, testPlan: { isActive: true } },
    orderBy: { priorityScore: "desc" },
    take: 5,
    select: { id: true, name: true, journey: true, type: true, priorityScore: true },
  });
}
