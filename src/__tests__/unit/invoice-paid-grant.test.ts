import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/stripe/client", () => ({ stripe: {} }));
vi.mock("@/lib/stripe/credits", () => ({ fulfillCreditPurchase: vi.fn() }));
vi.mock("@/lib/billing/credit-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/credit-periods")>()),
  grantAddedSeatCredits: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findFirst: vi.fn() },
    invoice: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/stripe/prices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/prices")>();
  return {
    ...actual,
    getTierFromPriceId: vi.fn((id: string) => (id === "price_pro" || id === "price_pro_annual" ? "starter" : null)),
  };
});

import { prisma } from "@/lib/db";
import { handleInvoicePaid } from "@/app/api/webhooks/stripe/handlers";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";
import { grantAddedSeatCredits } from "@/lib/billing/credit-periods";

const db = prisma as unknown as {
  workspace: { findFirst: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const PER_SEAT = TIER_LIMITS.starter.monthlyCredits;
const PERIOD_END = 1_762_600_000;

interface LineSpec { price: string; quantity: number; proration?: boolean; amount?: number; item?: string }

function invoice(lines: LineSpec[], id = "in_1", billingReason = "subscription_cycle"): Stripe.Invoice {
  return {
    id,
    billing_reason: billingReason,
    customer: "cus_1",
    amount_paid: 7900,
    currency: "usd",
    status: "paid",
    invoice_pdf: null,
    period_start: 1_760_000_000,
    period_end: 1_760_000_000,
    lines: {
      data: lines.map((l) => ({
        quantity: l.quantity,
        amount: l.amount ?? 7900,
        period: { start: 1_760_000_000, end: PERIOD_END },
        pricing: { type: "price_details", price_details: { price: l.price, product: "prod_1" }, unit_amount_decimal: "7900" },
        parent: {
          type: "subscription_item_details",
          subscription_item_details: { proration: l.proration ?? false, subscription: "sub_1", subscription_item: l.item ?? "si_1" },
        },
      })),
    },
  } as unknown as Stripe.Invoice;
}

function useFake(...args: Parameters<typeof createFakeCreditDb>) {
  const fake = createFakeCreditDb(...args);
  db.$transaction.mockImplementation(fake.$transaction);
  return fake;
}

describe("handleInvoicePaid credit grant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.workspace.findFirst.mockResolvedValue({ id: "ws-1" });
  });

  it("grants from the invoice's price and seat quantity even before the subscription sync", async () => {
    // Workspace not yet synced: still on the free starting balance
    const fake = useFake({ current: 100, granted: 100 });

    await handleInvoicePaid(invoice([{ price: "price_pro", quantity: 3 }]));

    const grant = PER_SEAT * 3;
    expect(fake.workspace).toMatchObject({
      creditsCurrent: grant, creditsRollover: 100, creditsGranted: grant, creditBalance: grant + 100,
      rolloverExpiresAt: new Date(PERIOD_END * 1000),
    });
    expect(fake.rows.at(-1)).toMatchObject({
      type: "monthly_grant",
      amount: grant,
      balance: grant + 100,
      description: expect.stringContaining("Pro plan, 3 seats"),
      metadata: { stripeInvoiceId: "in_1", tier: "starter", seats: 3, rolledOver: 100 },
    });
  });

  it("records the plan line's service period on the invoice row, not Stripe's invoice-level period", async () => {
    useFake({ current: 0 });
    await handleInvoicePaid(invoice([{ price: "price_pro", quantity: 1 }]));
    const upsert = (prisma as unknown as { invoice: { upsert: ReturnType<typeof vi.fn> } }).invoice.upsert;
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      periodStart: new Date(1_760_000_000_000), periodEnd: new Date(PERIOD_END * 1000),
    });
  });

  it("ignores proration lines", async () => {
    const fake = useFake({ current: 0, granted: 0 });

    await handleInvoicePaid(invoice([
      { price: "price_pro", quantity: 9, proration: true },
      { price: "price_pro", quantity: 2 },
    ]));

    expect(fake.workspace.creditsCurrent).toBe(PER_SEAT * 2);
  });

  it("grants nothing for invoices without a known subscription price", async () => {
    const fake = useFake({ current: 100 });

    await handleInvoicePaid(invoice([{ price: "price_unknown", quantity: 1 }]));

    expect(fake.rows).toHaveLength(0);
    expect(fake.workspace.creditBalance).toBe(100);
  });

  it("grants and rolls over at most once per invoice when Stripe redelivers concurrently", async () => {
    const fake = useFake({ current: 400, rollover: 50, granted: PER_SEAT });
    const paid = invoice([{ price: "price_pro", quantity: 1 }], "in_2");

    await Promise.all([handleInvoicePaid(paid), handleInvoicePaid(paid)]);
    await handleInvoicePaid(paid);

    expect(fake.rows.filter((r) => r.type === "monthly_grant")).toHaveLength(1);
    expect(fake.rows.filter((r) => r.type === "expiry")).toHaveLength(1);
    expect(fake.workspace).toMatchObject({
      creditsCurrent: PER_SEAT, creditsRollover: 400, creditBalance: PER_SEAT + 400,
    });
  });

  it("grants a paid seat increase's prorated credits from its proration lines, not a monthly grant", async () => {
    const fake = useFake({ current: 500, granted: PER_SEAT });

    await handleInvoicePaid(invoice([
      { price: "price_pro", quantity: 2, proration: true, amount: -7900 },
      { price: "price_pro", quantity: 5, proration: true, amount: 19750 },
    ], "in_seats", "subscription_update"));

    expect(grantAddedSeatCredits).toHaveBeenCalledWith({
      workspaceId: "ws-1", stripeInvoiceId: "in_seats", tier: "starter", oldSeats: 2, newSeats: 5,
      changedAt: new Date(1_760_000_000_000),
    });
    expect(fake.rows).toHaveLength(0);
  });

  it("grants nothing for a seat decrease invoice", async () => {
    useFake({ current: 500 });

    await handleInvoicePaid(invoice([
      { price: "price_pro", quantity: 5, proration: true, amount: -9875 },
      { price: "price_pro", quantity: 2, proration: true, amount: 3950 },
    ], "in_cut", "subscription_update"));

    expect(grantAddedSeatCredits).not.toHaveBeenCalled();
  });

  it("an annual invoice grants month 1 only; the scheduler grants the rest", async () => {
    const fake = useFake({ current: 0, granted: 0 });
    const yearly = invoice([{ price: "price_pro_annual", quantity: 2 }], "in_year");
    const line = (yearly.lines.data[0] as unknown as { period: { start: number; end: number } });
    line.period = { start: 1_760_000_000, end: 1_760_000_000 + 365 * 86_400 };

    await handleInvoicePaid(yearly);

    expect(fake.workspace).toMatchObject({
      creditsCurrent: PER_SEAT * 2, creditsPeriodPaidSeats: 2,
      creditsPeriodStart: new Date(1_760_000_000_000),
    });
    // One month's grant, not twelve
    expect(fake.rows.at(-1)?.amount).toBe(PER_SEAT * 2);
  });

  describe("seat-change invoices that can't be accounted for grant nothing", () => {
    const up = (lines: LineSpec[]) => invoice(lines, "in_odd", "subscription_update");
    const credit = { price: "price_pro", quantity: 2, proration: true, amount: -7900 };
    const charge = { price: "price_pro", quantity: 5, proration: true, amount: 19750 };

    it.each([
      ["an extra proration line", [credit, charge, { ...charge, quantity: 1, amount: 3950 }]],
      ["a missing credit line", [charge]],
      ["lines on different subscription items", [credit, { ...charge, item: "si_2" }]],
      ["lines on different prices", [{ ...credit, price: "price_pro_annual" }, charge]],
      ["a net amount that doesn't match the added seats", [credit, { ...charge, amount: 30000 }]],
    ])("%s", async (_label, lines) => {
      useFake({ current: 500 });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await handleInvoicePaid(up(lines as LineSpec[]));

      expect(grantAddedSeatCredits).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no seat credits granted"));
      warn.mockRestore();
    });
  });
});

