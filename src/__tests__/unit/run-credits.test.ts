import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/db", () => ({
  prisma: {
    testRun: { findUnique: vi.fn() },
    testResult: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { chargeRunCredits } from "@/lib/billing/run-credits";

const db = prisma as unknown as {
  testRun: { findUnique: ReturnType<typeof vi.fn> };
  testResult: { count: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function useFake(...args: Parameters<typeof createFakeCreditDb>) {
  const fake = createFakeCreditDb(...args);
  db.$transaction.mockImplementation(fake.$transaction);
  return fake;
}

describe("chargeRunCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.testRun.findUnique.mockResolvedValue({ project: { workspaceId: "ws-1" } });
    db.testResult.count.mockResolvedValue(3);
  });

  it("deducts one credit per executed test case and records where it came from", async () => {
    const fake = useFake({ current: 100 });

    expect(await chargeRunCredits("run-1")).toBe(3);

    expect(db.testResult.count).toHaveBeenCalledWith({
      where: { testRunId: "run-1", verdict: { in: ["pass", "fail", "flaky", "healed"] } },
    });
    expect(fake.workspace).toMatchObject({ creditsCurrent: 97, creditBalance: 97 });
    expect(fake.rows).toEqual([
      expect.objectContaining({
        workspaceId: "ws-1", type: "consumption", amount: -3, balance: 97, testRunId: "run-1",
        metadata: { fromRollover: 0, fromCurrent: 3, fromPurchased: 0 },
      }),
    ]);
  });

  it("never charges the same run twice, even when retries race", async () => {
    const fake = useFake({ current: 100 });

    await Promise.all([chargeRunCredits("run-1"), chargeRunCredits("run-1")]);

    expect(fake.rows).toHaveLength(1);
    expect(fake.workspace.creditBalance).toBe(97);
  });

  it("charges nothing when no test case executed", async () => {
    db.testResult.count.mockResolvedValue(0);
    const fake = useFake({ current: 100 });

    await chargeRunCredits("run-1");

    expect(fake.rows).toHaveLength(0);
    expect(fake.workspace.creditBalance).toBe(100);
  });
});
