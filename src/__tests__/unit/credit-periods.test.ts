import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/self-host", () => ({ isSelfHosted: () => false }));
vi.mock("@/lib/db", () => ({
  prisma: { workspace: { findMany: vi.fn() }, $transaction: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";
import {
  addMonthsUTC,
  currentPeriodStart,
  resetDueFreeCredits,
  startFreePeriod,
  grantAddedSeatCredits,
  proratedSeatCredits,
} from "@/lib/billing/credit-periods";

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

describe("period dates", () => {
  it("adds months in UTC, clamped to the month's last day", () => {
    expect(addMonthsUTC(new Date("2026-01-31T10:00:00Z"), 1)).toEqual(new Date("2026-02-28T10:00:00Z"));
    expect(addMonthsUTC(new Date("2026-03-15T00:00:00Z"), -1)).toEqual(new Date("2026-02-15T00:00:00Z"));
  });

  it("finds the latest monthly anniversary not after now", () => {
    const start = new Date("2026-07-10T00:00:00Z");
    expect(currentPeriodStart(start, new Date("2026-10-20T00:00:00Z"))).toEqual(new Date("2026-10-10T00:00:00Z"));
  });
});

describe("Free monthly reset", () => {
  const now = new Date("2026-10-20T00:00:00Z");

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

describe("downgrade to Free", () => {
  it("expires the paid grant and rollover with ledger rows, keeps purchased, starts a Free period", async () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const fake = useFake({ current: 600, rollover: 200, purchased: 50, granted: 1000 });

    await startFreePeriod("ws-1", now);

    expect(fake.workspace).toMatchObject({
      creditsCurrent: FREE, creditsRollover: 0, creditsPurchased: 50, creditsPeriodStart: now, rolloverExpiresAt: null,
    });
    expect(fake.rows.map((r) => [r.type, r.amount])).toEqual([
      ["expiry", -200], ["expiry", -600], ["monthly_grant", FREE],
    ]);
  });
});

describe("prorated credits for added seats", () => {
  const billing = { billingPeriodStart: new Date("2026-10-01T00:00:00Z"), billingPeriodEnd: new Date("2026-10-31T00:00:00Z") };
  // Paid halfway through the period
  const increase = {
    workspaceId: "ws-1", tier: "starter" as const, addedSeats: 3, stripeInvoiceId: "in_seats",
    period: { start: new Date("2026-10-16T00:00:00Z"), end: billing.billingPeriodEnd },
  };

  it("computes added seats x per-seat credits x remaining fraction, rounded down", () => {
    expect(proratedSeatCredits(3, 1000, 0.5)).toBe(1500);
    expect(proratedSeatCredits(1, 1000, 1 / 3)).toBe(333);
    expect(proratedSeatCredits(-2, 1000, 0.5)).toBe(0);
  });

  it("grants the added seats' share of the period once per paid invoice", async () => {
    const fake = useFake({ current: 1200, granted: 2 * PER_SEAT, extra: billing });

    await Promise.all([grantAddedSeatCredits(increase), grantAddedSeatCredits(increase)]);
    await grantAddedSeatCredits(increase);

    const credits = (3 * PER_SEAT) / 2;
    expect(fake.workspace).toMatchObject({ creditsCurrent: 1200 + credits, creditsGranted: 2 * PER_SEAT + credits });
    expect(fake.rows).toEqual([
      expect.objectContaining({
        type: "monthly_grant", amount: credits,
        metadata: { stripeInvoiceId: "in_seats", seatsAdded: 3, prorated: true },
      }),
    ]);
  });

  it("grants nothing without a synced billing period or on non-seat tiers", async () => {
    const fake = useFake({ current: 1200, extra: { billingPeriodStart: null, billingPeriodEnd: null } });
    expect(await grantAddedSeatCredits(increase)).toBe(0);
    expect(await grantAddedSeatCredits({ ...increase, tier: "free", stripeInvoiceId: "in_2" })).toBe(0);
    expect(fake.rows).toHaveLength(0);
  });
});
