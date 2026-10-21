import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const stripeSubs = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/stripe/client", () => ({ stripe: { subscriptions: stripeSubs } }));
vi.mock("@/lib/db", () => ({
  prisma: { workspace: { findUniqueOrThrow: vi.fn(), update: vi.fn() }, subscription: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/billing/workspace-header", () => ({ billingWorkspaceId: vi.fn(async () => "ws-1") }));
vi.mock("@/lib/auth/rbac", () => ({ requirePermission: vi.fn(async () => ({ workspaceId: "ws-1" })) }));
vi.mock("@/lib/auth/tenant", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  countSeatsInUse: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { countSeatsInUse } from "@/lib/auth/tenant";
import { PATCH } from "@/app/api/billing/subscription/route";
import { updateSeatCount } from "@/lib/stripe/subscriptions";

const db = prisma as unknown as {
  workspace: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  subscription: { findFirst: ReturnType<typeof vi.fn> };
};

const setSeats = (seats: number) =>
  PATCH(new NextRequest("http://localhost/api/billing/subscription", {
    method: "PATCH",
    body: JSON.stringify({ action: "set_seats", seats }),
  }));

describe("PATCH set_seats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.workspace.findUniqueOrThrow.mockResolvedValue({ stripeSubscriptionId: "sub_1", tier: "starter" });
    db.subscription.findFirst.mockResolvedValue({ status: "active" });
    vi.mocked(countSeatsInUse).mockResolvedValue({ members: 4, pending: 2 });
    stripeSubs.retrieve.mockResolvedValue({ items: { data: [{ id: "si_1", quantity: 6 }] } });
  });

  it("refuses to cut seats below members plus pending invites", async () => {
    const res = await setSeats(5);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "SEATS_IN_USE", message: expect.stringMatching(/Remove members/) });
    expect(stripeSubs.update).not.toHaveBeenCalled();
  });

  it("only changes seats on an active or trialing subscription", async () => {
    db.subscription.findFirst.mockResolvedValue({ status: "past_due" });

    expect((await setSeats(8)).status).toBe(409);
    expect(stripeSubs.update).not.toHaveBeenCalled();
  });

  it("asks Stripe for the change but never writes seatCount itself", async () => {
    expect((await setSeats(8)).status).toBe(200);

    expect(stripeSubs.update).toHaveBeenCalledTimes(1);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });
});

describe("updateSeatCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeSubs.retrieve.mockResolvedValue({ items: { data: [{ id: "si_1", quantity: 3 }] } });
  });

  it("invoices an increase now and applies it only once paid", async () => {
    await updateSeatCount("sub_1", 5);
    expect(stripeSubs.update).toHaveBeenCalledWith("sub_1", {
      items: [{ id: "si_1", quantity: 5 }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
    });
  });

  it("credits a decrease on the next invoice", async () => {
    await updateSeatCount("sub_1", 2);
    expect(stripeSubs.update).toHaveBeenCalledWith("sub_1", {
      items: [{ id: "si_1", quantity: 2 }],
      proration_behavior: "create_prorations",
    });
  });
});
