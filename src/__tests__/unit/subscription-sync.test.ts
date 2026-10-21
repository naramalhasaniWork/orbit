import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({ stripe: {} }));
vi.mock("@/lib/db", () => ({
  prisma: {
    subscription: { upsert: vi.fn(), updateMany: vi.fn() },
    workspace: { update: vi.fn() },
  },
}));
vi.mock("@/lib/billing/credit-periods", () => ({ startFreePeriod: vi.fn() }));
vi.mock("@/lib/stripe/prices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/prices")>();
  return { ...actual, getTierFromPriceId: vi.fn(() => "starter") };
});

import { prisma } from "@/lib/db";
import { syncSubscriptionToWorkspace, downgradeToFree } from "@/lib/stripe/subscriptions";
import { startFreePeriod } from "@/lib/billing/credit-periods";
import { TIER_LIMITS } from "@/lib/auth/tier-limits";

const db = prisma as unknown as { workspace: { update: ReturnType<typeof vi.fn> } };

describe("syncSubscriptionToWorkspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets the monthly credit grant from the subscription's seat count", async () => {
    const now = new Date();
    await syncSubscriptionToWorkspace("ws-1", "sub_1", "price_pro", "active", now, now, false, 4);

    expect(db.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: expect.objectContaining({
        tier: "starter",
        seatCount: 4,
        monthlyCredits: TIER_LIMITS.starter.monthlyCredits * 4,
      }),
    });
    const data = db.workspace.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("projectLimit");
    expect(data).not.toHaveProperty("memberLimit");
  });

  it("downgrade to Free resets seats and starts a Free credit period", async () => {
    await downgradeToFree("ws-1");

    expect(db.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: expect.objectContaining({ tier: "free", seatCount: 1 }),
    });
    expect(startFreePeriod).toHaveBeenCalledWith("ws-1");
  });
});
