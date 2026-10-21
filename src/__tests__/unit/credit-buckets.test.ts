import { describe, it, expect } from "vitest";
import {
  debitBuckets,
  applyGrantToBuckets,
  lockCredits,
  chargeCredits,
  grantMonthlyCredits,
  addPurchasedCredits,
} from "@/lib/billing/credit-buckets";
import { createFakeCreditDb } from "../helpers/fake-credit-db";
import type { Prisma } from "@/generated/prisma/client";

type Fake = ReturnType<typeof createFakeCreditDb>;
const EXPIRES = new Date("2026-12-01T00:00:00Z");
const PERIOD = { start: new Date("2026-11-01T00:00:00Z"), end: EXPIRES };

function run<T>(fake: Fake, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return fake.$transaction((tx) => fn(tx as Prisma.TransactionClient));
}

const charge = (fake: Fake, amount: number) =>
  run(fake, async (tx) => chargeCredits(tx, "ws-1", await lockCredits(tx, "ws-1"), amount, { description: "run" }));
const grant = (fake: Fake, amount: number) =>
  run(fake, async (tx) => grantMonthlyCredits(tx, "ws-1", await lockCredits(tx, "ws-1"), amount, PERIOD, { description: "grant" }));
const buy = (fake: Fake, amount: number) =>
  run(fake, async (tx) => addPurchasedCredits(tx, "ws-1", await lockCredits(tx, "ws-1"), amount, { description: "pack" }));

const buckets = (fake: Fake) => ({
  current: fake.workspace.creditsCurrent,
  rollover: fake.workspace.creditsRollover,
  purchased: fake.workspace.creditsPurchased,
});

describe("consumption order", () => {
  it("spends rollover first, then current, then purchased", () => {
    const b = { current: 100, rollover: 30, purchased: 500 };
    expect(debitBuckets(b, 20)).toEqual({ rollover: 10, current: 100, purchased: 500 });
    expect(debitBuckets(b, 80)).toEqual({ rollover: 0, current: 50, purchased: 500 });
    expect(debitBuckets(b, 200)).toEqual({ rollover: 0, current: 0, purchased: 430 });
  });

  it("records a charge beyond every bucket as debt in purchased", () => {
    expect(debitBuckets({ current: 10, rollover: 0, purchased: 5 }, 25)).toEqual({ rollover: 0, current: 0, purchased: -10 });
  });
});

describe("monthly rollover", () => {
  it("rolls over the unused grant and expires the previous rollover", () => {
    expect(applyGrantToBuckets({ current: 600, rollover: 250, purchased: 40 }, 1000, 1000)).toEqual({
      buckets: { current: 1000, rollover: 600, purchased: 40 },
      rolledOver: 600,
      expiredRollover: 250,
      expiredCurrent: 0,
    });
  });

  it("caps rollover at the previous grant", () => {
    const out = applyGrantToBuckets({ current: 3000, rollover: 0, purchased: 0 }, 1000, 1000);
    expect(out.rolledOver).toBe(1000);
    expect(out.expiredCurrent).toBe(2000);
  });

  it("grant -> partial use -> next grant rolls over the right amount; old rollover expires at the grant after", async () => {
    const fake = createFakeCreditDb({ current: 0, granted: 0, purchased: 200 });

    await grant(fake, 1000);
    await charge(fake, 400);
    await grant(fake, 1000);
    expect(buckets(fake)).toEqual({ current: 1000, rollover: 600, purchased: 200 });
    expect(fake.workspace.rolloverExpiresAt).toEqual(EXPIRES);

    await charge(fake, 100); // from rollover
    expect(buckets(fake)).toEqual({ current: 1000, rollover: 500, purchased: 200 });

    await grant(fake, 1000);
    expect(buckets(fake)).toEqual({ current: 1000, rollover: 1000, purchased: 200 });
    expect(fake.rows.filter((r) => r.type === "expiry")).toEqual([
      expect.objectContaining({ amount: -500, balance: 1200, metadata: { source: "rollover" } }),
    ]);
    // Every balance on the ledger is the running sum, so the history explains itself
    let running = 200;
    for (const row of fake.rows) {
      running += row.amount;
      expect(row.balance).toBe(running);
    }
    expect(fake.workspace.creditBalance).toBe(running);
  });

  it("clears the rollover expiry when nothing rolls over", async () => {
    const fake = createFakeCreditDb({ current: 0, granted: 1000 });
    await grant(fake, 1000);
    expect(fake.workspace.rolloverExpiresAt).toBeNull();
  });
});

describe("purchased packs", () => {
  it("never expire across grants", async () => {
    const fake = createFakeCreditDb({ current: 1000, granted: 1000 });
    await buy(fake, 500);
    for (let month = 0; month < 4; month++) await grant(fake, 1000);

    expect(fake.workspace.creditsPurchased).toBe(500);
    expect(fake.rows.filter((r) => r.type === "expiry").every((r) => r.metadata?.source !== "purchased")).toBe(true);
  });
});

describe("concurrency", () => {
  it("two charges against one balance each spend distinct credits under the row lock", async () => {
    const fake = createFakeCreditDb({ current: 100 });

    await Promise.all([charge(fake, 80), charge(fake, 80)]);

    expect(buckets(fake)).toEqual({ current: 0, rollover: 0, purchased: -60 });
    expect(fake.workspace.creditBalance).toBe(-60);
    expect(fake.rows.map((r) => r.balance).sort((a, b) => a - b)).toEqual([-60, 20]);
  });

  it("without the lock the same race loses a charge (what the lock prevents)", async () => {
    const fake = createFakeCreditDb({ current: 100 }, { lock: false });

    await Promise.all([charge(fake, 80), charge(fake, 80)]);

    expect(fake.workspace.creditBalance).toBe(20);
  });

  it("a grant racing a charge keeps both", async () => {
    const fake = createFakeCreditDb({ current: 300, granted: 1000 });

    await Promise.all([charge(fake, 100), grant(fake, 1000)]);

    expect(fake.workspace.creditBalance).toBe(1200);
  });
});
