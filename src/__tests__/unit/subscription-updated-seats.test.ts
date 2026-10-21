import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/stripe/client", () => ({ stripe: {} }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/stripe/subscriptions", () => ({ syncSubscriptionToWorkspace: vi.fn(), downgradeToFree: vi.fn() }));
vi.mock("@/lib/billing/credit-periods", () => ({ grantAddedSeatCredits: vi.fn() }));
vi.mock("@/lib/stripe/prices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/prices")>();
  return { ...actual, getTierFromPriceId: vi.fn(() => "starter") };
});

import { handleSubscriptionUpdated } from "@/app/api/webhooks/stripe/handlers";
import { grantAddedSeatCredits } from "@/lib/billing/credit-periods";
import { syncSubscriptionToWorkspace } from "@/lib/stripe/subscriptions";

describe("customer.subscription.updated", () => {
  it("grants added-seat credits keyed by the event before syncing the new seat count", async () => {
    const order: string[] = [];
    vi.mocked(grantAddedSeatCredits).mockImplementation(async () => (order.push("grant"), 0));
    vi.mocked(syncSubscriptionToWorkspace).mockImplementation(async () => void order.push("sync"));
    const sub = {
      id: "sub_1",
      status: "active",
      metadata: { workspaceId: "ws-1" },
      current_period_start: 1_760_000_000,
      current_period_end: 1_762_600_000,
      items: { data: [{ quantity: 4, price: { id: "price_pro" } }] },
    } as unknown as Stripe.Subscription;

    await handleSubscriptionUpdated(sub, "evt_9");

    expect(grantAddedSeatCredits).toHaveBeenCalledWith({
      workspaceId: "ws-1", tier: "starter", seats: 4, stripeEventId: "evt_9",
      periodStart: new Date(1_760_000_000_000), periodEnd: new Date(1_762_600_000_000),
    });
    expect(order).toEqual(["grant", "sync"]);
  });
});
