import { prisma } from "@/lib/db";
import type { ExecutionMode } from "@/generated/prisma/enums";

/**
 * Model calls and estimated model spend per 100 test executions, split by
 * execution mode (agent / replay / replay_healed). This is the baseline for
 * the compile-and-replay cost target. Skipped cases never executed, so they
 * are excluded.
 */

export interface ModeCost {
  mode: ExecutionMode | "all";
  executions: number;
  modelCalls: number;
  costUsd: number;
  callsPer100: number;
  costPer100Usd: number;
}

export interface ExecutionCostReport {
  since: string;
  total: ModeCost;
  byMode: ModeCost[];
  /** Share of executions served by a replay script (replay + replay_healed) */
  replayShare: number;
  /** Executor-phase spend recorded in token_usage for the same window, as a cross-check */
  executorTokenUsageUsd: number;
}

export interface ModeAggregate {
  executionMode: ExecutionMode;
  _count: { _all: number };
  _sum: { modelCalls: number | null; modelCostUsd: unknown };
}

const MODES: ExecutionMode[] = ["agent", "replay", "replay_healed"];

function per100(value: number, executions: number): number {
  return executions === 0 ? 0 : round((value / executions) * 100);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function modeCost(mode: ModeCost["mode"], executions: number, modelCalls: number, costUsd: number): ModeCost {
  return {
    mode, executions, modelCalls, costUsd: round(costUsd),
    callsPer100: per100(modelCalls, executions),
    costPer100Usd: per100(costUsd, executions),
  };
}

export function summarizeExecutionCost(
  rows: ModeAggregate[], since: Date, executorTokenUsageUsd: number
): ExecutionCostReport {
  const byMode = MODES.map((mode) => {
    const row = rows.find((r) => r.executionMode === mode);
    return modeCost(
      mode, row?._count._all ?? 0, row?._sum.modelCalls ?? 0, Number(row?._sum.modelCostUsd ?? 0)
    );
  });
  const executions = byMode.reduce((n, m) => n + m.executions, 0);
  const total = modeCost(
    "all", executions,
    byMode.reduce((n, m) => n + m.modelCalls, 0),
    byMode.reduce((n, m) => n + m.costUsd, 0)
  );
  const replayed = byMode.filter((m) => m.mode !== "agent").reduce((n, m) => n + m.executions, 0);
  return {
    since: since.toISOString(),
    total,
    byMode,
    replayShare: executions === 0 ? 0 : round(replayed / executions),
    executorTokenUsageUsd: round(executorTokenUsageUsd),
  };
}

export async function getExecutionCostReport(since: Date, workspaceId?: string): Promise<ExecutionCostReport> {
  const scope = workspaceId ? { testRun: { project: { workspaceId } } } : {};
  const [rows, tokenUsage] = await Promise.all([
    prisma.testResult.groupBy({
      by: ["executionMode"],
      where: { createdAt: { gte: since }, verdict: { not: "skipped" }, ...scope },
      _count: { _all: true },
      _sum: { modelCalls: true, modelCostUsd: true },
    }),
    prisma.tokenUsage.aggregate({
      where: { createdAt: { gte: since }, agentPhase: "executor", ...(workspaceId ? { workspaceId } : {}) },
      _sum: { cost: true },
    }),
  ]);
  return summarizeExecutionCost(rows, since, Number(tokenUsage._sum.cost ?? 0));
}
