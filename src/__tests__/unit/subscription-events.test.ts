import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const retrieve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe/client", () => ({ stripe: { subscriptions: { retrieve } } }));
vi.mock("@/lib/db", () => ({
  prisma: { workspace: { findFirst: vi.fn() }, auditLog: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe/subscriptions", () => ({ syncSubscriptionToWorkspace: vi.fn(), downgradeToFree: vi.fn() }));
vi.mock("@/lib/billing/credit-periods", () => ({ grantAddedSeatCredits: vi.fn(), creditPeriodEnd: vi.fn() }));

import { prisma } from "@/lib/db";
import { handleSubscriptionUpdated, handleSubscriptionDeleted } from "@/app/api/webhooks/stripe/handlers";
import { syncSubscriptionToWorkspace, downgradeToFree } from "@/lib/stripe/subscriptions";
import { grantAddedSeatCredits } from "@/lib/billing/credit-periods";

const db = prisma as unknown as { workspace: { findFirst: ReturnType<typeof vi.fn> } };

function sub(quantity: number, status = "active", extra: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1", status, customer: "cus_1", metadata: { workspaceId: "ws-1" },
    current_period_start: 1_760_000_000, current_period_end: 1_762_600_000, cancel_at_period_end: false,
    items: { data: [{ quantity, price: { id: "price_pro" } }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

const seatsSynced = () => vi.mocked(syncSubscriptionToWorkspace).mock.calls.map((c) => c[7]);

describe("subscription events sync from Stripe's current state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a stale updated event re-applies the current seats instead of its own", async () => {
    retrieve.mockResolvedValue(sub(3));

    await handleSubscriptionUpdated(sub(5)); // older event, from before a cut to 3

    expect(retrieve).toHaveBeenCalledWith("sub_1");
    expect(seatsSynced()).toEqual([3]);
  });

  it("an unpaid pending seat increase grants nothing and keeps the paid seat count", async () => {
    retrieve.mockResolvedValue(sub(2, "active", { pending_update: { subscription_items: [{ quantity: 5 }] } }));

    await handleSubscriptionUpdated(sub(2));

    expect(seatsSynced()).toEqual([2]);
    expect(grantAddedSeatCredits).not.toHaveBeenCalled();
  });

  it("leaves a canceled subscription to the deleted handler", async () => {
    retrieve.mockResolvedValue(sub(2, "canceled"));
    await handleSubscriptionUpdated(sub(2));
    expect(syncSubscriptionToWorkspace).not.toHaveBeenCalled();
  });

  it("deleted: downgrades only when Stripe says canceled and it is the workspace's current subscription", async () => {
    db.workspace.findFirst.mockResolvedValue({ id: "ws-1", stripeSubscriptionId: "sub_1" });

    retrieve.mockResolvedValue(sub(2, "active"));
    await handleSubscriptionDeleted(sub(2, "canceled"));
    expect(downgradeToFree).not.toHaveBeenCalled();

    db.workspace.findFirst.mockResolvedValue({ id: "ws-1", stripeSubscriptionId: "sub_new" });
    retrieve.mockResolvedValue(sub(2, "canceled"));
    await handleSubscriptionDeleted(sub(2, "canceled"));
    expect(downgradeToFree).not.toHaveBeenCalled();

    db.workspace.findFirst.mockResolvedValue({ id: "ws-1", stripeSubscriptionId: "sub_1" });
    await handleSubscriptionDeleted(sub(2, "canceled"));
    expect(downgradeToFree).toHaveBeenCalledWith("ws-1");
  });

  it("incomplete_expired downgrades, but only the workspace's current subscription", async () => {
    retrieve.mockResolvedValue(sub(2, "incomplete_expired"));

    db.workspace.findFirst.mockResolvedValue({ id: "ws-1", stripeSubscriptionId: "sub_new" });
    await handleSubscriptionUpdated(sub(2, "incomplete"));
    expect(downgradeToFree).not.toHaveBeenCalled();

    db.workspace.findFirst.mockResolvedValue({ id: "ws-1", stripeSubscriptionId: "sub_1" });
    await handleSubscriptionUpdated(sub(2, "incomplete"));
    expect(downgradeToFree).toHaveBeenCalledWith("ws-1");
    expect(syncSubscriptionToWorkspace).not.toHaveBeenCalled();
  });
});

