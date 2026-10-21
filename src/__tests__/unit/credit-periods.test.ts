import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/db", () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from "@/lib/db";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";
import {
  addMonthsUTC,
  currentPeriodStart,
  creditPeriodEnd,
  startFreePeriod,
  grantAddedSeatCredits,
  proratedSeatCredits,
} from "@/lib/billing/credit-periods";

const db = prisma as unknown as { $transaction: ReturnType<typeof vi.fn> };
const FREE = TIER_LIMITS.free.monthlyCredits;
const PER_SEAT = TIER_LIMITS.starter.monthlyCredits;

function useFake(...args: Parameters<typeof createFakeCreditDb>) {
  const fake = createFakeCreditDb(...args);
  db.$transaction.mockImplementation(fake.$transaction);
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

  it("ends a credit period after one month, or at the billing period end if sooner", () => {
    const start = new Date("2026-10-10T00:00:00Z");
    expect(creditPeriodEnd(start, new Date("2027-07-10T00:00:00Z"))).toEqual(new Date("2026-11-10T00:00:00Z"));
    expect(creditPeriodEnd(start, new Date("2026-11-01T00:00:00Z"))).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(creditPeriodEnd(start, null)).toEqual(new Date("2026-11-10T00:00:00Z"));
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
  // Monthly credit period Oct 1 - Nov 1 (31 days); changes paid on Oct 16 (half way, roughly)
  const period = {
    creditsPeriodStart: new Date("2026-10-01T00:00:00Z"),
    billingPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    creditsPeriodPaidSeats: 2,
  };
  const changedAt = new Date("2026-10-16T12:00:00Z");
  const increase = (newSeats: number, oldSeats: number, stripeInvoiceId: string) => ({
    workspaceId: "ws-1", tier: "starter" as const, oldSeats, newSeats, changedAt, stripeInvoiceId,
  });
  const HALF = PER_SEAT / 2;

  it("computes added seats x per-seat credits x remaining fraction, rounded down", () => {
    expect(proratedSeatCredits(3, 1000, 0.5)).toBe(1500);
    expect(proratedSeatCredits(1, 1000, 1 / 3)).toBe(333);
    expect(proratedSeatCredits(-2, 1000, 0.5)).toBe(0);
  });

  it("grants the added seats' share of the monthly period once per paid invoice", async () => {
    const fake = useFake({ current: 1200, granted: 2 * PER_SEAT, extra: period });

    await Promise.all([grantAddedSeatCredits(increase(5, 2, "in_a")), grantAddedSeatCredits(increase(5, 2, "in_a"))]);

    expect(fake.rows).toEqual([
      expect.objectContaining({ type: "monthly_grant", amount: 3 * HALF, metadata: { stripeInvoiceId: "in_a", seatsAdded: 3, prorated: true } }),
    ]);
    expect(fake.workspace).toMatchObject({ creditsCurrent: 1200 + 3 * HALF, creditsPeriodPaidSeats: 5 });
  });

  it("cycling seats up, down and up again in one period grants once", async () => {
    const fake = useFake({ current: 1200, granted: 2 * PER_SEAT, extra: period });

    await grantAddedSeatCredits(increase(5, 2, "in_up1"));
    // The cut to 2 grants nothing (no paid increase invoice); then back up to 5, and to 6
    expect(await grantAddedSeatCredits(increase(5, 2, "in_up2"))).toBe(0);
    expect(await grantAddedSeatCredits(increase(6, 5, "in_up3"))).toBe(HALF);

    expect(fake.rows.map((r) => r.amount)).toEqual([3 * HALF, HALF]);
    expect(fake.workspace.creditsPeriodPaidSeats).toBe(6);
  });

  it("prorates over the monthly credit period on annual plans, not the year", async () => {
    const fake = useFake({
      current: 0, granted: PER_SEAT,
      extra: { ...period, billingPeriodEnd: new Date("2027-10-01T00:00:00Z"), creditsPeriodPaidSeats: 1 },
    });

    await grantAddedSeatCredits(increase(2, 1, "in_annual"));

    expect(fake.rows[0].amount).toBe(HALF);
  });

  it("grants nothing on non-seat tiers", async () => {
    const fake = useFake({ current: 0, extra: period });
    expect(await grantAddedSeatCredits({ ...increase(9, 1, "in_f"), tier: "free" })).toBe(0);
    expect(fake.rows).toHaveLength(0);
  });
});
