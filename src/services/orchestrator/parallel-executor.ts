import { prisma } from "@/lib/db";
import { emitRunProgress } from "@/lib/websocket";
import { isRunCancelled } from "./run-manager";
import type { TestVerdict } from "@/generated/prisma/enums";
import type { RoleSessions } from "@/services/execution/role-sessions";

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
  /** Set when the environment failed validation; every case is recorded as environment_error */
  environmentError?: string;
}

interface ValidatedEnvironment {
  environmentUrl: string;
  credentials: Record<string, string>;
}

const VISUAL_JOURNEY = "visual_identity";

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

  // One environment for the whole run: validate once, like the sequential path
  const { validateEnvironment } = await import(
    "@/services/execution/environment-validator"
  );
  const validation = await validateEnvironment(environmentId);
  if (!validation.valid) {
    const reason = `Environment validation failed: ${validation.errors.join("; ")}`;
    const { recordEnvironmentError } = await import("@/services/execution/test-result-store");
    await recordEnvironmentError(runId, partitions.flatMap((p) => p.testCaseIds), reason);
    return { passed: 0, failed: 0, flaky: 0, skipped: totalTests, cancelled: false, environmentError: reason };
  }

  // Visual cases go last so they can reuse a session from login tests
  partitions.sort((a, b) =>
    Number(a.journey === VISUAL_JOURNEY) - Number(b.journey === VISUAL_JOURNEY)
  );

  const counters = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  // Shared across partitions, one logged-in session per required role
  const { createRoleSessions } = await import("@/services/execution/role-sessions");
  const sessions = createRoleSessions();
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

      const result = await executePartition(runId, partition, validation, sessions);

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
        flaky: counters.flaky,
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
  validation: ValidatedEnvironment,
  sessions: RoleSessions
): Promise<{
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  cancelled: boolean;
}> {
  const { executeCaseByType } = await import(
    "@/services/execution/case-dispatcher"
  );
  const { saveTestResult } = await import(
    "@/services/execution/test-result-store"
  );
  const { isTestQuarantined } = await import(
    "@/services/execution/flaky-registry"
  );
  const { resolveRoleCredentials } = await import(
    "@/services/execution/role-credentials"
  );

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
      await saveTestResult(runId, tc.id, "skipped", 0, [], {}, []);
      continue;
    }

    try {
      const steps = tc.steps as Array<{
        action: string;
        expected: string;
        selector?: string;
      }>;

      const caseForExecution = {
        id: tc.id,
        name: tc.name,
        type: tc.type,
        steps,
        projectId: tc.projectId,
        isCritical: tc.isCritical,
        requiredRole: tc.requiredRole ?? undefined,
      };

      // Same per-role credentials and sessions as the sequential runner
      const result = await executeCaseByType(
        runId, caseForExecution, validation.environmentUrl,
        resolveRoleCredentials(validation.credentials, tc.requiredRole ?? undefined),
        { storageState: sessions.get(tc.requiredRole) }
      );
      if (result.storageState) sessions.remember(tc.requiredRole, result.storageState);

      // Record every executed case so the run report and billing see it
      await saveTestResult(
        runId, tc.id, result.verdict as TestVerdict, result.durationMs,
        result.steps, result.artifacts, result.healedSelectors
      );
      await prisma.testCase.update({
        where: { id: tc.id },
        data: { lastVerdict: result.verdict as TestVerdict, lastRunAt: new Date() },
      });

      const verdictMap: Record<string, keyof typeof counters> = {
        pass: "passed",
        fail: "failed",
        flaky: "flaky",
        healed: "passed",
        environment_error: "skipped",
        skipped: "skipped",
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
