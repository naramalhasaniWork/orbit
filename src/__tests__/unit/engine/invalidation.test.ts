import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    systemMapNode: { findMany: vi.fn() },
    systemMapEdge: { findMany: vi.fn() },
    testScript: { updateMany: vi.fn(), findMany: vi.fn() },
    testCase: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { markScriptsSuspect } from "@/server/engine/replay/invalidation";
import { analyzeDiff } from "@/services/planning/diff-analyzer";

type Mocked = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  systemMapNode: { findMany: Mocked };
  systemMapEdge: { findMany: Mocked };
  testScript: { updateMany: Mocked; findMany: Mocked };
  testCase: { findMany: Mocked };
};

describe("markScriptsSuspect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags active scripts covering changed nodes or their 1-hop neighbours", async () => {
    db.systemMapNode.findMany.mockResolvedValue([{ id: "component-1" }]);
    db.systemMapEdge.findMany.mockResolvedValue([{ sourceNodeId: "route-1", targetNodeId: "component-1" }]);
    db.testScript.updateMany.mockResolvedValue({ count: 2 });

    const count = await markScriptsSuspect("p1", ["src/components/Button.tsx"]);

    expect(db.systemMapNode.findMany).toHaveBeenCalledWith({
      where: { projectId: "p1", filePath: { in: ["src/components/Button.tsx"] } }, select: { id: true },
    });
    expect(db.testScript.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", status: "active", coveredNodeIds: { hasSome: ["component-1", "route-1"] } },
      data: { status: "suspect" },
    });
    expect(count).toBe(2);
  });

  it("touches nothing when the change maps to no node", async () => {
    db.systemMapNode.findMany.mockResolvedValue([]);
    expect(await markScriptsSuspect("p1", ["README.md"])).toBe(0);
    expect(db.testScript.updateMany).not.toHaveBeenCalled();
  });
});

describe("analyzeDiff with replay coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.systemMapNode.findMany.mockResolvedValue([
      { id: "route-billing", name: "route:/billing", filePath: "src/app/billing/page.tsx", type: "route" },
      { id: "route-team", name: "route:/team", filePath: "src/app/team/page.tsx", type: "route" },
    ]);
    db.systemMapEdge.findMany.mockResolvedValue([]);
    db.testCase.findMany.mockResolvedValue([
      { id: "tc-scripted-hit", name: "Pay an invoice", steps: [], journey: null, isCritical: false },
      { id: "tc-scripted-miss", name: "route:/billing page loads", steps: [], journey: null, isCritical: false },
      { id: "tc-unscripted", name: "Open route:/billing", steps: [], journey: null, isCritical: false },
    ]);
    db.testScript.findMany.mockResolvedValue([
      { testCaseId: "tc-scripted-hit", coveredNodeIds: ["route-billing"] },
      { testCaseId: "tc-scripted-miss", coveredNodeIds: ["route-team"] },
    ]);
  });

  it("selects scripted cases by covered nodes and only name-matches unscripted ones", async () => {
    const analysis = await analyzeDiff("p1", [
      { path: "src/app/billing/page.tsx", status: "modified", additions: 1, deletions: 0 },
    ]);

    const selected = analysis.affectedTestCases.map((t) => [t.testCaseId, t.reason]);
    expect(selected).toEqual([
      ["tc-scripted-hit", "Replay script covers 1 affected route"],
      ["tc-unscripted", 'Test name matches affected node "route:/billing"'],
    ]);
  });
});
