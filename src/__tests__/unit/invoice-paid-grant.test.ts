import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/stripe/client", () => ({ stripe: {} }));
vi.mock("@/lib/stripe/credits", () => ({ fulfillCreditPurchase: vi.fn() }));
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
    getTierFromPriceId: vi.fn((id: string) => (id === "price_pro" ? "starter" : null)),
  };
});

import { prisma } from "@/lib/db";
import { handleInvoicePaid } from "@/app/api/webhooks/stripe/handlers";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";

const db = prisma as unknown as {
  workspace: { findFirst: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const PER_SEAT = TIER_LIMITS.starter.monthlyCredits;
const PERIOD_END = 1_762_600_000;

interface LineSpec { price: string; quantity: number; proration?: boolean }

function invoice(lines: LineSpec[], id = "in_1"): Stripe.Invoice {
  return {
    id,
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
        period: { start: 1_760_000_000, end: PERIOD_END },
        pricing: { type: "price_details", price_details: { price: l.price, product: "prod_1" } },
        parent: {
          type: "subscription_item_details",
          subscription_item_details: { proration: l.proration ?? false, subscription: "sub_1" },
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
});
