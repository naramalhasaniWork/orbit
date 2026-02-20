import { prisma } from "@/lib/db";
import { emitRunProgress } from "@/lib/websocket";
import { isRunCancelled } from "./run-manager";

/**
 * Partitions test cases into independent groups by journey,
 * then executes groups in parallel (up to concurrency limit).
 * Falls back to sequential execution if BullMQ is unavailable.
 */

interface TestCasePartition {
  journey: string;
  testCaseIds: string[];
}

interface ParallelRunOptions {
  runId: string;
  testPlanId: string;
  environmentId: string;
  mode: string;
  maxConcurrency: number;
}

interface ParallelRunResult {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  cancelled: boolean;
}

/**
 * Partition test cases into independent groups by journey.
 * Tests within the same journey run sequentially (they may share state).
 * Different journeys run in parallel.
 */
async function partitionTestCases(
  projectId: string,
  testPlanId: string,
  mode: string
): Promise<TestCasePartition[]> {
  const where: Record<string, unknown> = {
    projectId,
    testPlanId,
    isEnabled: true,
  };

  if (mode === "smoke") {
    where.priorityScore = { gte: 80 };
  } else if (mode === "regression") {
    where.lastVerdict = { in: ["fail", "flaky"] };
  }

  const testCases = await prisma.testCase.findMany({
    where,
    orderBy: { priorityScore: "desc" },
    select: { id: true, journey: true },
  });

  const groups = new Map<string, string[]>();
  for (const tc of testCases) {
    const journey = tc.journey ?? "default";
    const existing = groups.get(journey) ?? [];
    existing.push(tc.id);
    groups.set(journey, existing);
  }

  return Array.from(groups.entries()).map(([journey, testCaseIds]) => ({
    journey,
    testCaseIds,
  }));
}

/**
 * Execute test case partitions with controlled concurrency.
 * Uses a simple promise-pool pattern (no BullMQ dependency for local dev).
 * In production, this would dispatch jobs to BullMQ workers.
 */
export async function executeParallel(
  options: ParallelRunOptions
): Promise<ParallelRunResult> {
  const { runId, testPlanId, environmentId, mode, maxConcurrency } = options;

  const run = await prisma.testRun.findUniqueOrThrow({
    where: { id: runId },
    select: { projectId: true },
  });

  const partitions = await partitionTestCases(
    run.projectId, testPlanId, mode
  );

  if (partitions.length === 0) {
    return { passed: 0, failed: 0, flaky: 0, skipped: 0, cancelled: false };
  }

  const totalTests = partitions.reduce(
    (sum, p) => sum + p.testCaseIds.length, 0
  );

  await prisma.testRun.update({
    where: { id: runId },
    data: { totalTests },
  });

  const counters = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  let cancelled = false;

  // Concurrency-limited execution
  const concurrency = Math.min(maxConcurrency, partitions.length);
  const pending: Promise<void>[] = [];
  let partitionIndex = 0;

  async function executeNextPartition(): Promise<void> {
    while (partitionIndex < partitions.length) {
      if (cancelled) return;

      const partition = partitions[partitionIndex++];

      // Check cancellation between partitions
      if (await isRunCancelled(runId)) {
        cancelled = true;
        return;
      }

      const result = await executePartition(
        runId, partition, environmentId
      );

      counters.passed += result.passed;
      counters.failed += result.failed;
      counters.flaky += result.flaky;
      counters.skipped += result.skipped;

      if (result.cancelled) {
        cancelled = true;
        return;
      }

      // Emit progress
      await emitRunProgress(runId, {
        runId,
        status: "executing",
        currentTest: `Completed journey: ${partition.journey}`,
        totalTests,
        passed: counters.passed,
        failed: counters.failed,
      });
    }
  }

  // Launch concurrent workers
  for (let i = 0; i < concurrency; i++) {
    pending.push(executeNextPartition());
  }

  await Promise.all(pending);

  return { ...counters, cancelled };
}

/**
 * Execute a single partition (group of test cases in the same journey).
 * Test cases within a partition run sequentially.
 */
async function executePartition(
  runId: string,
  partition: TestCasePartition,
  environmentId: string
): Promise<{
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  cancelled: boolean;
}> {
  const { validateEnvironment } = await import(
    "@/services/execution/environment-validator"
  );
  const { executeTestCase } = await import(
    "@/services/execution/test-case-executor"
  );
  const { isTestQuarantined } = await import(
    "@/services/execution/flaky-registry"
  );

  const validation = await validateEnvironment(environmentId);
  if (!validation.valid) {
    return {
      passed: 0,
      failed: partition.testCaseIds.length,
      flaky: 0,
      skipped: 0,
      cancelled: false,
    };
  }

  const testCases = await prisma.testCase.findMany({
    where: { id: { in: partition.testCaseIds } },
    orderBy: { priorityScore: "desc" },
  });

  const counters = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

  for (const tc of testCases) {
    if (await isRunCancelled(runId)) {
      return { ...counters, cancelled: true };
    }

    const quarantined = await isTestQuarantined(tc.projectId, tc.id);
    if (quarantined) {
      counters.skipped++;
      await prisma.testResult.create({
        data: {
          testRunId: runId,
          testCaseId: tc.id,
          verdict: "skipped",
          durationMs: 0,
          steps: [],
          artifacts: {},
          healedSelectors: [],
        },
      });
      continue;
    }

    try {
      const steps = tc.steps as Array<{
        action: string;
        expected: string;
        selector?: string;
      }>;

      const result = await executeTestCase(
        runId,
        {
          id: tc.id,
          name: tc.name,
          steps,
          projectId: tc.projectId,
          isCritical: tc.isCritical,
        },
        validation.environmentUrl,
        validation.credentials
      );

      const verdictMap: Record<string, keyof typeof counters> = {
        pass: "passed",
        fail: "failed",
        flaky: "flaky",
        healed: "passed",
      };
      const key = verdictMap[result.verdict] ?? "failed";
      counters[key]++;
    } catch {
      counters.failed++;
    }
  }

  return { ...counters, cancelled: false };
}

export type { ParallelRunOptions, ParallelRunResult, TestCasePartition };
