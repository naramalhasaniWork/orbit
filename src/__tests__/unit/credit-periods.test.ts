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
  const periodStart = new Date("2026-10-01T00:00:00Z");
  const periodEnd = new Date("2026-10-31T00:00:00Z");
  const halfway = new Date("2026-10-16T00:00:00Z");
  const change = { workspaceId: "ws-1", tier: "starter" as const, seats: 5, periodStart, periodEnd, stripeEventId: "evt_1" };

  it("computes added seats x per-seat credits x remaining fraction, rounded down", () => {
    expect(proratedSeatCredits(3, 1000, 0.5)).toBe(1500);
    expect(proratedSeatCredits(1, 1000, 1 / 3)).toBe(333);
    expect(proratedSeatCredits(-2, 1000, 0.5)).toBe(0);
  });

  it("grants the added seats' share of the period right away, once per event", async () => {
    const fake = useFake({ current: 1200, granted: 2 * PER_SEAT, extra: { tier: "starter", seatCount: 2 } });

    expect(await grantAddedSeatCredits(change, halfway)).toBe(3 * PER_SEAT / 2);
    expect(await grantAddedSeatCredits(change, halfway)).toBe(0);

    expect(fake.workspace).toMatchObject({
      seatCount: 5, creditsCurrent: 1200 + 1500, creditsGranted: 2 * PER_SEAT + 1500,
    });
    expect(fake.rows).toEqual([
      expect.objectContaining({ type: "monthly_grant", amount: 1500, metadata: { stripeEventId: "evt_1", seatsAdded: 3, prorated: true } }),
    ]);
  });

  it("claws nothing back on a seat cut and grants nothing on a plan change", async () => {
    const fake = useFake({ current: 1200, granted: 5 * PER_SEAT, extra: { tier: "starter", seatCount: 5 } });
    expect(await grantAddedSeatCredits({ ...change, seats: 2 }, halfway)).toBe(0);

    fake.workspace.tier = "free";
    expect(await grantAddedSeatCredits({ ...change, seats: 9, stripeEventId: "evt_2" }, halfway)).toBe(0);

    expect(fake.rows).toHaveLength(0);
    expect(fake.workspace.creditsCurrent).toBe(1200);
  });
});
