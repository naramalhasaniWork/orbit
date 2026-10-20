import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TestScriptStatus } from "@/generated/prisma/enums";
import { coveredNodeIds, coveredRoutes } from "./covered-nodes";
import { FLAKE_WINDOW, REVERIFY_AFTER_MS } from "./replay-policy";
import type { ResolvedAction } from "./types";

// Persistence for compiled replay scripts (test_scripts).

export interface StoredScript {
  id: string;
  version: number;
  status: TestScriptStatus;
  stepsHash: string;
  actions: ResolvedAction[];
  lastVerifiedByAgentAt: Date;
}

/** The newest script still in use for this case in this environment/role/viewport. */
export async function findCurrentScript(testCaseId: string, envKey: string): Promise<StoredScript | null> {
  const row = await prisma.testScript.findFirst({
    where: { testCaseId, envKey, status: { in: ["active", "suspect"] } },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, stepsHash: true, actions: true, lastVerifiedByAgentAt: true },
  });
  return row ? { ...row, actions: row.actions as unknown as ResolvedAction[] } : null;
}

interface NewScript {
  projectId: string;
  testCaseId: string;
  envKey: string;
  stepsHash: string;
  actions: ResolvedAction[];
  sourceRunId?: string;
}

/** Write the next version as the active script and retire the older ones. Returns the version. */
export async function saveScriptVersion(script: NewScript): Promise<number> {
  const routes = coveredRoutes(script.actions);
  const nodeIds = await coveredNodeIds(script.projectId, routes);
  const run = script.sourceRunId
    ? await prisma.testRun.findUnique({ where: { id: script.sourceRunId }, select: { commitSha: true } })
    : null;

  return prisma.$transaction(async (tx) => {
    const latest = await tx.testScript.findFirst({
      where: { testCaseId: script.testCaseId, envKey: script.envKey },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await tx.testScript.updateMany({
      where: { testCaseId: script.testCaseId, envKey: script.envKey, status: { not: "retired" } },
      data: { status: "retired" },
    });
    await tx.testScript.create({
      data: {
        projectId: script.projectId,
        testCaseId: script.testCaseId,
        envKey: script.envKey,
        version,
        stepsHash: script.stepsHash,
        actions: script.actions as unknown as Prisma.InputJsonValue,
        coveredRoutes: routes,
        coveredNodeIds: nodeIds,
        sourceRunId: script.sourceRunId,
        sourceCommitSha: run?.commitSha ?? null,
      },
    });
    return version;
  });
}

/** After a replay: count it, count a divergence, and clear `suspect` once a replay passes cleanly. */
export async function recordReplay(scriptId: string, diverged: boolean): Promise<void> {
  await prisma.testScript.update({
    where: { id: scriptId },
    data: {
      replayCount: { increment: 1 },
      ...(diverged ? { divergenceCount: { increment: 1 } } : { status: "active" }),
    },
  });
}

export async function markVerifiedByAgent(scriptId: string): Promise<void> {
  await prisma.testScript.update({ where: { id: scriptId }, data: { lastVerifiedByAgentAt: new Date() } });
}

export async function retireScript(scriptId: string): Promise<void> {
  await prisma.testScript.update({ where: { id: scriptId }, data: { status: "retired" } });
}

/**
 * Whether each of the case's most recent replays (newest first) diverged,
 * in this environment. Only the last 14 days count, so a case benched for
 * flakiness gets another chance once its bad streak ages out.
 */
export async function recentReplayDivergences(testCaseId: string, environmentId: string): Promise<boolean[]> {
  const rows = await prisma.testResult.findMany({
    where: {
      testCaseId,
      executionMode: { in: ["replay", "replay_healed"] },
      createdAt: { gte: new Date(Date.now() - REVERIFY_AFTER_MS) },
      testRun: { environmentId },
    },
    orderBy: { createdAt: "desc" },
    take: FLAKE_WINDOW,
    select: { divergedAtStep: true },
  });
  return rows.map((r) => r.divergedAtStep !== null);
}
