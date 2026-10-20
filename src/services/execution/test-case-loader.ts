import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TestCaseForExecution } from "@/services/execution/test-case-executor";
import { getAffectedTestCaseIds } from "@/services/planning/diff-analyzer";
import { fetchPRDiff } from "@/services/reporting/integrations/github-repo";

interface RunForLoading {
  id: string;
  projectId: string;
  testPlanId: string | null;
  mode: string;
  prNumber: number | null;
  metadata: Prisma.JsonValue;
}

/** How a targeted run chose its test cases; stored on run.metadata.testSelection. */
interface TestSelection {
  strategy: "diff" | "full_suite_fallback";
  reason: string;
  changedFiles: number;
  affectedTestCases: number;
}

/**
 * Load the test cases a run should execute. Targeted runs execute only the
 * cases affected by the diff (push commits or PR files) and fall back to the
 * full suite when the diff is unavailable or maps to nothing.
 */
export async function loadTestCases(run: RunForLoading): Promise<TestCaseForExecution[]> {
  const where: Prisma.TestCaseWhereInput = { projectId: run.projectId, isEnabled: true };
  if (run.testPlanId) where.testPlanId = run.testPlanId;
  if (run.mode === "smoke") where.priorityScore = { gte: 80 };
  else if (run.mode === "regression") where.lastVerdict = { in: ["fail", "flaky"] };

  if (run.mode !== "targeted") return findCases(where);

  const changedFiles = await resolveChangedFiles(run);
  if (changedFiles.length === 0) {
    await recordSelection(run, fallback("No diff available for this run", 0));
    return findCases(where);
  }

  const affectedIds = await getAffectedTestCaseIds(run.projectId, changedFiles);
  const targeted = affectedIds.length > 0
    ? await findCases({ ...where, id: { in: affectedIds } })
    : [];

  if (targeted.length === 0) {
    await recordSelection(run, fallback("Diff did not map to any test case", changedFiles.length));
    return findCases(where);
  }

  await recordSelection(run, {
    strategy: "diff",
    reason: `${targeted.length} test case(s) affected by ${changedFiles.length} changed file(s)`,
    changedFiles: changedFiles.length,
    affectedTestCases: targeted.length,
  });
  return targeted;
}

function fallback(reason: string, changedFiles: number): TestSelection {
  return { strategy: "full_suite_fallback", reason, changedFiles, affectedTestCases: 0 };
}

async function resolveChangedFiles(run: RunForLoading): Promise<string[]> {
  const meta = asObject(run.metadata);
  const stored = meta.changedFiles;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.filter((f): f is string => typeof f === "string");
  }
  if (run.prNumber) {
    const files = await fetchPRDiff(run.projectId, run.prNumber);
    return files.map((f) => f.filename);
  }
  return [];
}

async function recordSelection(run: RunForLoading, selection: TestSelection): Promise<void> {
  const testSelection: Prisma.InputJsonObject = { ...selection };
  await prisma.testRun.update({
    where: { id: run.id },
    data: { metadata: { ...asObject(run.metadata), testSelection } },
  });
}

function asObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

async function findCases(where: Prisma.TestCaseWhereInput): Promise<TestCaseForExecution[]> {
  const cases = await prisma.testCase.findMany({ where, orderBy: { priorityScore: "desc" } });
  return cases.map((tc) => ({
    id: tc.id, name: tc.name, type: tc.type,
    steps: tc.steps as Array<{ action: string; expected: string; selector?: string }>,
    projectId: tc.projectId, isCritical: tc.isCritical,
    requiredRole: tc.requiredRole ?? undefined,
  }));
}
