import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    testCase: { findMany: vi.fn() },
    testRun: { update: vi.fn() },
  },
}));
vi.mock("@/services/planning/diff-analyzer", () => ({
  getAffectedTestCaseIds: vi.fn(),
}));
vi.mock("@/services/reporting/integrations/github-repo", () => ({
  fetchPRDiff: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getAffectedTestCaseIds } from "@/services/planning/diff-analyzer";
import { fetchPRDiff } from "@/services/reporting/integrations/github-repo";
import { loadTestCases } from "@/services/execution/test-case-loader";

const db = prisma as unknown as {
  testCase: { findMany: ReturnType<typeof vi.fn> };
  testRun: { update: ReturnType<typeof vi.fn> };
};
const affected = getAffectedTestCaseIds as ReturnType<typeof vi.fn>;
const prDiff = fetchPRDiff as ReturnType<typeof vi.fn>;

function tc(id: string) {
  return {
    id, name: id, type: "e2e", steps: [], projectId: "p1",
    isCritical: false, requiredRole: null,
  };
}

const baseRun = {
  id: "run-1", projectId: "p1", testPlanId: "plan-1",
  mode: "targeted", prNumber: null as number | null, metadata: {},
};

function recordedSelection() {
  const call = db.testRun.update.mock.calls.at(-1)?.[0] as {
    data: { metadata: { testSelection: Record<string, unknown> } };
  };
  return call.data.metadata.testSelection;
}

describe("loadTestCases (targeted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.testRun.update.mockResolvedValue({});
  });

  it("runs only the test cases affected by the PR diff", async () => {
    prDiff.mockResolvedValue([{ filename: "src/app/login/page.tsx" }]);
    affected.mockResolvedValue(["tc-login"]);
    db.testCase.findMany.mockResolvedValue([tc("tc-login")]);

    const cases = await loadTestCases({ ...baseRun, prNumber: 12 });

    expect(prDiff).toHaveBeenCalledWith("p1", 12);
    expect(affected).toHaveBeenCalledWith("p1", ["src/app/login/page.tsx"]);
    expect(db.testCase.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ testPlanId: "plan-1", id: { in: ["tc-login"] } }),
      orderBy: { priorityScore: "desc" },
    });
    expect(cases.map((c) => c.id)).toEqual(["tc-login"]);
    expect(recordedSelection()).toMatchObject({ strategy: "diff", affectedTestCases: 1 });
  });

  it("uses push changedFiles stored on the run before asking GitHub", async () => {
    affected.mockResolvedValue(["tc-a"]);
    db.testCase.findMany.mockResolvedValue([tc("tc-a")]);

    await loadTestCases({ ...baseRun, prNumber: 3, metadata: { changedFiles: ["a.ts"] } });

    expect(prDiff).not.toHaveBeenCalled();
    expect(affected).toHaveBeenCalledWith("p1", ["a.ts"]);
  });

  it("falls back to the full suite when no diff is available", async () => {
    db.testCase.findMany.mockResolvedValue([tc("tc-a"), tc("tc-b")]);

    const cases = await loadTestCases(baseRun);

    expect(cases).toHaveLength(2);
    expect(recordedSelection()).toMatchObject({
      strategy: "full_suite_fallback", reason: "No diff available for this run",
    });
  });

  it("falls back to the full suite when the diff maps to no test case", async () => {
    prDiff.mockResolvedValue([{ filename: "README.md" }]);
    affected.mockResolvedValue([]);
    db.testCase.findMany.mockResolvedValue([tc("tc-a"), tc("tc-b")]);

    const cases = await loadTestCases({ ...baseRun, prNumber: 9 });

    expect(cases).toHaveLength(2);
    expect(recordedSelection()).toMatchObject({
      strategy: "full_suite_fallback", changedFiles: 1,
    });
  });

  it("leaves non-targeted modes unchanged", async () => {
    db.testCase.findMany.mockResolvedValue([tc("tc-a")]);

    await loadTestCases({ ...baseRun, mode: "smoke" });

    expect(affected).not.toHaveBeenCalled();
    expect(db.testRun.update).not.toHaveBeenCalled();
    expect(db.testCase.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ priorityScore: { gte: 80 } }),
      orderBy: { priorityScore: "desc" },
    });
  });
});
