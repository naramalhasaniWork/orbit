import { prisma } from "@/lib/db";

// ============================================================
// Configuration
// ============================================================

const QUARANTINE_THRESHOLD = 5;
const PASS_RATE_LOOKBACK = 10;

// ============================================================
// Flaky Test Detection
// ============================================================

export async function recordFlakyResult(
  projectId: string,
  testCaseId: string,
  passed: boolean
): Promise<{ isFlaky: boolean; isQuarantined: boolean }> {
  const existing = await prisma.flakyTest.findUnique({
    where: { flaky_test_unique: { projectId, testCaseId } },
  });

  if (existing) {
    const newOccurrences = existing.occurrences + 1;
    const passRate = await calculatePassRate(testCaseId);

    const shouldQuarantine =
      newOccurrences >= QUARANTINE_THRESHOLD && passRate !== null && passRate < 0.5;

    await prisma.flakyTest.update({
      where: { id: existing.id },
      data: {
        occurrences: newOccurrences,
        passRate,
        isQuarantined: shouldQuarantine || existing.isQuarantined,
        lastFlakyAt: new Date(),
      },
    });

    return {
      isFlaky: true,
      isQuarantined: shouldQuarantine || existing.isQuarantined,
    };
  }

  // First flaky occurrence
  await prisma.flakyTest.create({
    data: {
      projectId,
      testCaseId,
      occurrences: 1,
      passRate: passed ? 1.0 : 0.0,
      lastFlakyAt: new Date(),
    },
  });

  return { isFlaky: true, isQuarantined: false };
}

// ============================================================
// Pass Rate Calculation
// ============================================================

async function calculatePassRate(testCaseId: string): Promise<number | null> {
  const recentResults = await prisma.testResult.findMany({
    where: { testCaseId },
    orderBy: { createdAt: "desc" },
    take: PASS_RATE_LOOKBACK,
    select: { verdict: true },
  });

  if (recentResults.length === 0) return null;

  const passes = recentResults.filter((r) => r.verdict === "pass").length;
  return passes / recentResults.length;
}

// ============================================================
// Check if Test is Quarantined
// ============================================================

export async function isTestQuarantined(
  projectId: string,
  testCaseId: string
): Promise<boolean> {
  const record = await prisma.flakyTest.findUnique({
    where: { flaky_test_unique: { projectId, testCaseId } },
    select: { isQuarantined: true },
  });

  return record?.isQuarantined ?? false;
}

// ============================================================
// Detect Flaky From Retry
// ============================================================

export async function detectFlakyFromRetry(
  projectId: string,
  testCaseId: string,
  firstVerdict: string,
  retryVerdict: string
): Promise<boolean> {
  // A test is flaky if it fails then passes (or vice versa) without code change
  const isFlaky =
    (firstVerdict === "fail" && retryVerdict === "pass") ||
    (firstVerdict === "pass" && retryVerdict === "fail");

  if (isFlaky) {
    await recordFlakyResult(projectId, testCaseId, retryVerdict === "pass");
  }

  return isFlaky;
}

// ============================================================
// Get Flaky Tests for Project
// ============================================================

export async function getProjectFlakyTests(projectId: string) {
  return prisma.flakyTest.findMany({
    where: { projectId },
    include: {
      testCase: {
        select: { name: true, journey: true, type: true },
      },
    },
    orderBy: { occurrences: "desc" },
  });
}

// ============================================================
// Reset Flaky Status
// ============================================================

export async function resetFlakyStatus(
  projectId: string,
  testCaseId: string
): Promise<void> {
  await prisma.flakyTest.updateMany({
    where: { projectId, testCaseId },
    data: {
      isQuarantined: false,
      occurrences: 0,
      passRate: null,
    },
  });
}
