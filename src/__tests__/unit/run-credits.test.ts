import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  creditTransaction: { findFirst: vi.fn(), create: vi.fn() },
  testRun: { update: vi.fn() },
  workspace: { update: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    testRun: { findUnique: vi.fn() },
    testResult: { count: vi.fn() },
    $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));

import { prisma } from "@/lib/db";
import { chargeRunCredits } from "@/lib/billing/run-credits";

const db = prisma as unknown as {
  testRun: { findUnique: ReturnType<typeof vi.fn> };
  testResult: { count: ReturnType<typeof vi.fn> };
};

describe("chargeRunCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.testRun.findUnique.mockResolvedValue({ project: { workspaceId: "ws-1" } });
    db.testResult.count.mockResolvedValue(3);
    tx.creditTransaction.findFirst.mockResolvedValue(null);
    tx.workspace.update.mockResolvedValue({ creditBalance: 97 });
  });

  it("deducts one credit per executed test case and records the transaction", async () => {
    const charged = await chargeRunCredits("run-1");

    expect(charged).toBe(3);
    expect(db.testResult.count).toHaveBeenCalledWith({
      where: { testRunId: "run-1", verdict: { in: ["pass", "fail", "flaky", "healed"] } },
    });
    expect(tx.testRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" }, data: { creditsConsumed: 3 },
    });
    expect(tx.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { creditBalance: { decrement: 3 } },
      select: { creditBalance: true },
    });
    expect(tx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws-1", type: "consumption", amount: -3, balance: 97, testRunId: "run-1",
      }),
    });
  });

  it("never charges the same run twice", async () => {
    tx.creditTransaction.findFirst.mockResolvedValue({ id: "ct-1" });

    await chargeRunCredits("run-1");

    expect(tx.workspace.update).not.toHaveBeenCalled();
    expect(tx.creditTransaction.create).not.toHaveBeenCalled();
  });

  it("charges nothing when no test case executed", async () => {
    db.testResult.count.mockResolvedValue(0);

    await chargeRunCredits("run-1");

    expect(tx.testRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" }, data: { creditsConsumed: 0 },
    });
    expect(tx.workspace.update).not.toHaveBeenCalled();
  });
});
