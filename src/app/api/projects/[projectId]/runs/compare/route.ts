import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/runs/compare?runA=...&runB=...
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const searchParams = request.nextUrl.searchParams;
  const runAId = searchParams.get("runA");
  const runBId = searchParams.get("runB");

  if (!runAId || !runBId) {
    return apiError(
      "Both runA and runB query parameters are required",
      "VALIDATION_ERROR",
      400
    );
  }

  const [runA, runB] = await Promise.all([
    prisma.testRun.findFirst({
      where: { id: runAId, projectId },
      include: {
        results: {
          include: {
            testCase: {
              select: { id: true, name: true, type: true, journey: true },
            },
          },
        },
      },
    }),
    prisma.testRun.findFirst({
      where: { id: runBId, projectId },
      include: {
        results: {
          include: {
            testCase: {
              select: { id: true, name: true, type: true, journey: true },
            },
          },
        },
      },
    }),
  ]);

  if (!runA) return apiError("Run A not found", "NOT_FOUND", 404);
  if (!runB) return apiError("Run B not found", "NOT_FOUND", 404);

  // Build result maps keyed by test case ID
  const resultsA = new Map(runA.results.map((r) => [r.testCaseId, r]));
  const resultsB = new Map(runB.results.map((r) => [r.testCaseId, r]));

  // All test case IDs from both runs
  const allTestCaseIds = new Set([...Array.from(resultsA.keys()), ...Array.from(resultsB.keys())]);

  interface ComparedTest {
    testCaseId: string;
    testCaseName: string;
    type: string;
    journey: string | null;
    verdictA: string | null;
    verdictB: string | null;
    change: "improved" | "regressed" | "unchanged" | "new" | "removed";
    durationChangeMs: number | null;
  }

  const compared: ComparedTest[] = [];
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  let newTests = 0;
  let removedTests = 0;

  for (const tcId of Array.from(allTestCaseIds)) {
    const rA = resultsA.get(tcId);
    const rB = resultsB.get(tcId);

    const testCase = rA?.testCase ?? rB?.testCase;
    if (!testCase) continue;

    const verdictA = rA?.verdict ?? null;
    const verdictB = rB?.verdict ?? null;

    let change: ComparedTest["change"] = "unchanged";

    if (!verdictA && verdictB) {
      change = "new";
      newTests++;
    } else if (verdictA && !verdictB) {
      change = "removed";
      removedTests++;
    } else if (verdictA === verdictB) {
      change = "unchanged";
      unchanged++;
    } else if (verdictB === "pass" && verdictA !== "pass") {
      change = "improved";
      improved++;
    } else if (verdictA === "pass" && verdictB !== "pass") {
      change = "regressed";
      regressed++;
    } else {
      change = "unchanged";
      unchanged++;
    }

    compared.push({
      testCaseId: tcId,
      testCaseName: testCase.name,
      type: testCase.type,
      journey: testCase.journey,
      verdictA,
      verdictB,
      change,
      durationChangeMs:
        rA?.durationMs != null && rB?.durationMs != null
          ? rB.durationMs - rA.durationMs
          : null,
    });
  }

  // Sort: regressions first, then improvements, then unchanged
  const changeOrder: Record<string, number> = {
    regressed: 0,
    improved: 1,
    new: 2,
    removed: 3,
    unchanged: 4,
  };
  compared.sort(
    (a, b) => (changeOrder[a.change] ?? 4) - (changeOrder[b.change] ?? 4)
  );

  return apiSuccess({
    runA: {
      id: runA.id,
      sequenceNumber: runA.sequenceNumber,
      prNumber: runA.prNumber,
      status: runA.status,
      mode: runA.mode,
      trigger: runA.trigger,
      totalTests: runA.totalTests,
      passed: runA.passed,
      failed: runA.failed,
      flaky: runA.flaky,
      createdAt: runA.createdAt,
      branch: runA.branch,
      commitSha: runA.commitSha,
    },
    runB: {
      id: runB.id,
      sequenceNumber: runB.sequenceNumber,
      prNumber: runB.prNumber,
      status: runB.status,
      mode: runB.mode,
      trigger: runB.trigger,
      totalTests: runB.totalTests,
      passed: runB.passed,
      failed: runB.failed,
      flaky: runB.flaky,
      createdAt: runB.createdAt,
      branch: runB.branch,
      commitSha: runB.commitSha,
    },
    summary: { improved, regressed, unchanged, newTests, removedTests },
    tests: compared,
  });
});
