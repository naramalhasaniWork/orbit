import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/stripe/client", () => ({ stripe: {} }));
vi.mock("@/lib/stripe/credits", () => ({ fulfillCreditPurchase: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findFirst: vi.fn(), update: vi.fn() },
    invoice: { upsert: vi.fn() },
    creditTransaction: { findFirst: vi.fn(), create: vi.fn() },
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
  workspace: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  creditTransaction: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

interface LineSpec { price: string; quantity: number; proration?: boolean }

function invoice(lines: LineSpec[]): Stripe.Invoice {
  return {
    id: "in_1",
    customer: "cus_1",
    amount_paid: 7900,
    currency: "usd",
    status: "paid",
    invoice_pdf: null,
    period_start: 1_760_000_000,
    period_end: 1_762_600_000,
    lines: {
      data: lines.map((l) => ({
        quantity: l.quantity,
        pricing: { type: "price_details", price_details: { price: l.price, product: "prod_1" } },
        parent: {
          type: "subscription_item_details",
          subscription_item_details: { proration: l.proration ?? false, subscription: "sub_1" },
        },
      })),
    },
  } as unknown as Stripe.Invoice;
}

describe("handleInvoicePaid credit grant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Workspace not yet synced: still on free defaults
    db.workspace.findFirst.mockResolvedValue({
      id: "ws-1", tier: "free", monthlyCredits: 100, creditBalance: 100,
    });
    db.creditTransaction.findFirst.mockResolvedValue(null);
  });

  it("grants from the invoice's price and seat quantity even before the subscription sync", async () => {
    await handleInvoicePaid(invoice([{ price: "price_pro", quantity: 3 }]));

    const expected = TIER_LIMITS.starter.monthlyCredits * 3;
    expect(db.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { creditBalance: { increment: expected } },
    });
    expect(db.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "monthly_grant",
        amount: expected,
        balance: 100 + expected,
        metadata: { stripeInvoiceId: "in_1", tier: "starter", seats: 3 },
      }),
    });
  });

  it("ignores proration lines", async () => {
    await handleInvoicePaid(invoice([
      { price: "price_pro", quantity: 9, proration: true },
      { price: "price_pro", quantity: 2 },
    ]));

    expect(db.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { creditBalance: { increment: TIER_LIMITS.starter.monthlyCredits * 2 } },
    });
  });

  it("grants nothing for invoices without a known subscription price", async () => {
    await handleInvoicePaid(invoice([{ price: "price_unknown", quantity: 1 }]));

    expect(db.creditTransaction.create).not.toHaveBeenCalled();
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("grants at most once per invoice when Stripe redelivers", async () => {
    db.creditTransaction.findFirst.mockResolvedValue({ id: "ct-1" });

    await handleInvoicePaid(invoice([{ price: "price_pro", quantity: 1 }]));

    expect(db.workspace.update).not.toHaveBeenCalled();
  });
});
