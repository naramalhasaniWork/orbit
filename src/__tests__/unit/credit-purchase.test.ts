import { describe, it, expect, vi } from "vitest";
import { createFakeCreditDb } from "../helpers/fake-credit-db";

vi.mock("@/lib/stripe/client", () => ({ stripe: {} }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from "@/lib/db";
import { fulfillCreditPurchase } from "@/lib/stripe/credits";

const db = prisma as unknown as { $transaction: ReturnType<typeof vi.fn> };

describe("fulfillCreditPurchase", () => {
  it("adds the pack to the purchased bucket once per checkout session", async () => {
    const fake = createFakeCreditDb({ current: 100 });
    db.$transaction.mockImplementation(fake.$transaction);

    await Promise.all([
      fulfillCreditPurchase("ws-1", 500, 3999, "cs_1"),
      fulfillCreditPurchase("ws-1", 500, 3999, "cs_1"),
    ]);

    expect(fake.workspace).toMatchObject({ creditsPurchased: 500, creditsCurrent: 100, creditBalance: 600 });
    expect(fake.rows).toEqual([
      expect.objectContaining({ type: "purchase", amount: 500, balance: 600, metadata: { stripeSessionId: "cs_1", amountPaid: 3999 } }),
    ]);
  });
});
