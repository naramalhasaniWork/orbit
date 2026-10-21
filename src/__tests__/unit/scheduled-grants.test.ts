import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/self-host", () => ({ isSelfHosted: () => false }));
vi.mock("@/lib/db", () => ({
  prisma: { workspace: { findMany: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/stripe/prices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/prices")>();
  const configs = actual.getAllTierConfigs();
  return {
    ...actual,
    getAllTierConfigs: () => ({ ...configs, starter: { ...configs.starter, stripePriceIdAnnual: "price_pro_annual" } }),
  };
});

import { prisma } from "@/lib/db";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";
import { resetDueFreeCredits, grantDueAnnualCredits } from "@/lib/billing/scheduled-grants";

const db = prisma as unknown as {
  workspace: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const FREE = TIER_LIMITS.free.monthlyCredits;
const PER_SEAT = TIER_LIMITS.starter.monthlyCredits;

function useFake(...args: Parameters<typeof createFakeCreditDb>) {
  const fake = createFakeCreditDb(...args);
  db.$transaction.mockImplementation(fake.$transaction);
  db.workspace.findMany.mockResolvedValue([{ id: "ws-1" }]);
  return fake;
}

beforeEach(() => vi.clearAllMocks());

const now = new Date("2026-10-20T00:00:00Z");

describe("Free monthly reset", () => {
  it("resets a due Free workspace to the cap: unused allowance expires, purchased stays", async () => {
    const fake = useFake({
      current: 30, purchased: 50, granted: FREE,
      extra: { tier: "free", creditsPeriodStart: new Date("2026-09-12T00:00:00Z") },
    });

    expect(await resetDueFreeCredits(now)).toBe(1);

    expect(fake.workspace).toMatchObject({
      creditsCurrent: FREE, creditsRollover: 0, creditsPurchased: 50, creditBalance: FREE + 50,
      creditsPeriodStart: new Date("2026-10-12T00:00:00Z"),
    });
    expect(fake.rows.map((r) => [r.type, r.amount])).toEqual([["expiry", -30], ["monthly_grant", FREE]]);
  });

  it("resets once when ticks overlap, and not again within the period", async () => {
    const fake = useFake({
      current: 0, granted: FREE,
      extra: { tier: "free", creditsPeriodStart: new Date("2026-09-12T00:00:00Z") },
    });

    await Promise.all([resetDueFreeCredits(now), resetDueFreeCredits(now)]);
    await resetDueFreeCredits(now);

    expect(fake.rows.filter((r) => r.type === "monthly_grant")).toHaveLength(1);
  });

  it("skips a workspace that upgraded before its lock was taken", async () => {
    const fake = useFake({
      current: 500, granted: 1000,
      extra: { tier: "starter", creditsPeriodStart: new Date("2026-09-12T00:00:00Z") },
    });

    expect(await resetDueFreeCredits(now)).toBe(0);
    expect(fake.rows).toHaveLength(0);
  });
});

describe("annual plans' monthly grant", () => {
  const annual = {
    tier: "starter", stripePriceId: "price_pro_annual", stripeSubscriptionId: "sub_1", subscriptionStatus: "active",
    seatCount: 3, billingPeriodStart: new Date("2026-07-10T00:00:00Z"), billingPeriodEnd: new Date("2027-07-10T00:00:00Z"),
    creditsPeriodStart: new Date("2026-09-10T00:00:00Z"),
  };

  it("grants the next month with rollover, anchored on the billing period start", async () => {
    const fake = useFake({ current: 400, granted: 3 * PER_SEAT, extra: annual });

    expect(await grantDueAnnualCredits(now)).toBe(1);

    expect(fake.workspace).toMatchObject({
      creditsCurrent: 3 * PER_SEAT, creditsRollover: 400, creditsPeriodPaidSeats: 3,
      creditsPeriodStart: new Date("2026-10-10T00:00:00Z"), rolloverExpiresAt: new Date("2026-11-10T00:00:00Z"),
    });
  });

  it("grants once across overlapping ticks", async () => {
    const fake = useFake({ current: 400, granted: 3 * PER_SEAT, extra: annual });

    await Promise.all([grantDueAnnualCredits(now), grantDueAnnualCredits(now)]);

    expect(fake.rows.filter((r) => r.type === "monthly_grant")).toHaveLength(1);
  });

  it("grants nothing for an inactive subscription or the month the yearly renewal covers", async () => {
    const pastDue = useFake({ current: 400, extra: { ...annual, subscriptionStatus: "past_due" } });
    expect(await grantDueAnnualCredits(now)).toBe(0);
    expect(pastDue.rows).toHaveLength(0);

    const renewal = useFake({ current: 400, extra: { ...annual, creditsPeriodStart: new Date("2027-06-10T00:00:00Z") } });
    expect(await grantDueAnnualCredits(new Date("2027-07-15T00:00:00Z"))).toBe(0);
    expect(renewal.rows).toHaveLength(0);
  });

  it("ignores monthly-billed workspaces (their invoices grant)", async () => {
    const fake = useFake({ current: 400, extra: { ...annual, stripePriceId: "price_pro" } });
    expect(await grantDueAnnualCredits(now)).toBe(0);
    expect(fake.rows).toHaveLength(0);
  });
});
