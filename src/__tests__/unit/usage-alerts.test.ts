import { describe, it, expect, vi, beforeEach } from "vitest";

const workspace = {
  creditBalance: 500,
  monthlyCredits: 500,
  tokenBudgetMonthly: null as number | null,
  billingPeriodStart: new Date(Date.now() - 5 * 86_400_000),
  billingPeriodEnd: new Date(Date.now() + 25 * 86_400_000),
};
let consumed = 0;
let tokenCost = 0;

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findUniqueOrThrow: vi.fn(async () => workspace) },
    creditTransaction: {
      aggregate: vi.fn(async () => ({ _sum: { amount: -consumed } })),
      findMany: vi.fn(async () => []),
    },
    tokenUsage: { aggregate: vi.fn(async () => ({ _sum: { cost: tokenCost } })) },
  },
}));

import { checkUsageAlerts } from "@/services/billing/usage-alerts";

beforeEach(() => {
  Object.assign(workspace, { creditBalance: 500, tokenBudgetMonthly: null });
  consumed = 0;
  tokenCost = 0;
});

describe("checkUsageAlerts", () => {
  it("returns nothing for a healthy workspace", async () => {
    expect(await checkUsageAlerts("w1")).toEqual([]);
  });

  it("flags low and exhausted credits", async () => {
    workspace.creditBalance = 50;
    expect((await checkUsageAlerts("w1")).map((a) => a.id)).toContain("credits-low");

    workspace.creditBalance = 0;
    const alerts = await checkUsageAlerts("w1");
    expect(alerts[0]).toMatchObject({ id: "credits-exhausted", severity: "critical" });
  });

  it("projects burn rate and sorts critical first", async () => {
    workspace.creditBalance = 100;
    consumed = 1000; // 200/day over 5 days
    tokenCost = 12;
    workspace.tokenBudgetMonthly = 10;

    const alerts = await checkUsageAlerts("w1");
    expect(alerts.map((a) => a.id)).toEqual(["budget-exceeded", "credits-low", "burn-rate-high"]);
  });
});
