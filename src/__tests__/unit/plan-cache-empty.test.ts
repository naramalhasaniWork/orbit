import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from "@/lib/db";
import { storePlan } from "@/services/planning/plan-cache";

describe("storePlan", () => {
  it("refuses to activate a plan with no test cases", async () => {
    await expect(storePlan("p1", 1, [], {})).rejects.toThrow(/No test cases were generated/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
