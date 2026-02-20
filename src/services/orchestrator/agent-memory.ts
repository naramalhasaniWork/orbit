import { prisma } from "@/lib/db";

/**
 * Agent memory — persistent knowledge across test runs.
 * Agents use this to detect patterns, avoid repeating mistakes,
 * and make smarter decisions based on historical data.
 */

interface RunTrend {
  runId: string;
  completedAt: string | null;
  passRate: number;
  totalTests: number;
  mode: string;
}

interface FailurePattern {
  testName: string;
  journey: string | null;
  consecutiveFailures: number;
  lastFailedAt: string;
  commonError: string | null;
}

interface FlakyPattern {
  testName: string;
  journey: string | null;
  occurrences: number;
  passRate: number | null;
  isQuarantined: boolean;
}

interface HealingRecord {
  originalSelector: string;
  healedSelector: string;
  healCount: number;
  isPersistent: boolean; // healed 3+ times
}

interface AgentMemorySnapshot {
  trends: RunTrend[];
  failurePatterns: FailurePattern[];
  flakyPatterns: FlakyPattern[];
  healingRecords: HealingRecord[];
  averagePassRate: number;
  totalRuns: number;
}

/**
 * Build a memory snapshot for agent context injection.
 * This is compact enough to fit in a prompt without blowing token budgets.
 */
export async function getMemorySnapshot(
  projectId: string,
  lookback = 10
): Promise<AgentMemorySnapshot> {
  const [trends, failurePatterns, flakyPatterns, healingRecords] =
    await Promise.all([
      getRunTrends(projectId, lookback),
      getFailurePatterns(projectId),
      getFlakyPatterns(projectId),
      getHealingRecords(projectId),
    ]);

  const averagePassRate =
    trends.length > 0
      ? trends.reduce((sum, t) => sum + t.passRate, 0) / trends.length
      : 1;

  return {
    trends,
    failurePatterns,
    flakyPatterns,
    healingRecords,
    averagePassRate,
    totalRuns: trends.length,
  };
}

/**
 * Format memory as a concise string for prompt injection.
 * Keeps it under ~500 tokens to avoid blowing context budgets.
 */
export function formatMemoryForPrompt(memory: AgentMemorySnapshot): string {
  const lines: string[] = [];

  lines.push(`## Agent Memory (${memory.totalRuns} previous runs)`);
  lines.push(
    `Average pass rate: ${(memory.averagePassRate * 100).toFixed(1)}%`
  );

  if (memory.failurePatterns.length > 0) {
    lines.push("\n### Recurring Failures");
    for (const f of memory.failurePatterns.slice(0, 5)) {
      lines.push(
        `- "${f.testName}" (${f.journey}): failed ${f.consecutiveFailures}x consecutively`
      );
      if (f.commonError) {
        lines.push(`  Error: ${f.commonError.slice(0, 100)}`);
      }
    }
  }

  if (memory.flakyPatterns.length > 0) {
    lines.push("\n### Flaky Tests");
    for (const f of memory.flakyPatterns.slice(0, 5)) {
      const rate = f.passRate !== null ? `${(f.passRate * 100).toFixed(0)}%` : "unknown";
      lines.push(
        `- "${f.testName}": ${f.occurrences} flaky runs, pass rate ${rate}${f.isQuarantined ? " [QUARANTINED]" : ""}`
      );
    }
  }

  if (memory.healingRecords.length > 0) {
    const persistent = memory.healingRecords.filter((h) => h.isPersistent);
    if (persistent.length > 0) {
      lines.push("\n### Persistent Selector Changes");
      for (const h of persistent.slice(0, 3)) {
        lines.push(
          `- "${h.originalSelector}" -> "${h.healedSelector}" (healed ${h.healCount}x)`
        );
      }
    }
  }

  return lines.join("\n");
}

// ============================================================
// Data Retrieval
// ============================================================

async function getRunTrends(
  projectId: string,
  lookback: number
): Promise<RunTrend[]> {
  const runs = await prisma.testRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: lookback,
    select: {
      id: true,
      completedAt: true,
      passed: true,
      totalTests: true,
      mode: true,
    },
  });

  return runs.map((r) => ({
    runId: r.id,
    completedAt: r.completedAt?.toISOString() ?? null,
    passRate: r.totalTests > 0 ? r.passed / r.totalTests : 1,
    totalTests: r.totalTests,
    mode: r.mode,
  }));
}

async function getFailurePatterns(
  projectId: string
): Promise<FailurePattern[]> {
  // Find test cases that have failed in the last 3+ consecutive runs
  const recentResults = await prisma.testResult.findMany({
    where: {
      testRun: { projectId, status: "completed" },
      verdict: "fail",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      testCase: { select: { name: true, journey: true } },
    },
  });

  // Group by test case and count consecutive failures
  const failureCounts = new Map<
    string,
    { name: string; journey: string | null; count: number; lastAt: string; error: string | null }
  >();

  for (const r of recentResults) {
    const existing = failureCounts.get(r.testCaseId);
    if (existing) {
      existing.count++;
    } else {
      failureCounts.set(r.testCaseId, {
        name: r.testCase.name,
        journey: r.testCase.journey,
        count: 1,
        lastAt: r.createdAt.toISOString(),
        error: r.failureExplanation,
      });
    }
  }

  return Array.from(failureCounts.values())
    .filter((f) => f.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((f) => ({
      testName: f.name,
      journey: f.journey,
      consecutiveFailures: f.count,
      lastFailedAt: f.lastAt,
      commonError: f.error,
    }));
}

async function getFlakyPatterns(
  projectId: string
): Promise<FlakyPattern[]> {
  const flakyTests = await prisma.flakyTest.findMany({
    where: { projectId },
    include: { testCase: { select: { name: true, journey: true } } },
    orderBy: { occurrences: "desc" },
    take: 10,
  });

  return flakyTests.map((f) => ({
    testName: f.testCase.name,
    journey: f.testCase.journey,
    occurrences: f.occurrences,
    passRate: f.passRate,
    isQuarantined: f.isQuarantined,
  }));
}

async function getHealingRecords(
  projectId: string
): Promise<HealingRecord[]> {
  const mappings = await prisma.selectorMapping.findMany({
    where: { projectId },
    orderBy: { healCount: "desc" },
    take: 10,
  });

  return mappings.map((m) => ({
    originalSelector: m.originalSelector,
    healedSelector: m.healedSelector,
    healCount: m.healCount,
    isPersistent: m.healCount >= 3,
  }));
}

export type {
  AgentMemorySnapshot,
  RunTrend,
  FailurePattern,
  FlakyPattern,
  HealingRecord,
};
