import { billingWorkspaceId } from "@/lib/billing/workspace-header";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import {
  getSubscriptionForWorkspace,
  cancelSubscription,
  reactivateSubscription,
  changeTier,
  updateSeatCount,
} from "@/lib/stripe/subscriptions";
import { getTierConfig } from "@/lib/stripe/prices";
import { countSeatsInUse, TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tenant";
import { memberLimit } from "@/lib/auth/tier-limits";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.view"
    );

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: {
        tier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        creditBalance: true,
        creditsGranted: true,
        creditsCurrent: true,
        creditsRollover: true,
        creditsPurchased: true,
        rolloverExpiresAt: true,
        seatCount: true,
      },
    });

    const [subscription, seatsInUse] = await Promise.all([
      getSubscriptionForWorkspace(ctx.workspaceId),
      countSeatsInUse(ctx.workspaceId),
    ]);
    const tier = workspace.tier as WorkspaceTier;
    const seatLimit = memberLimit(tier, workspace.seatCount);

    return apiSuccess({
      tier: workspace.tier,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            priceId: subscription.priceId,
          }
        : null,
      hasStripeCustomer: !!workspace.stripeCustomerId,
      creditBalance: workspace.creditBalance,
      monthlyCredits: workspace.creditsGranted, // this period's grant from the buckets, not the plan allowance
      credits: {
        current: workspace.creditsCurrent,
        rollover: workspace.creditsRollover,
        purchased: workspace.creditsPurchased,
        rolloverExpiresAt: workspace.rolloverExpiresAt?.toISOString() ?? null,
      },
      seats: {
        seatBased: TIER_LIMITS[tier].seatBased,
        limit: seatLimit === Infinity ? null : seatLimit,
        ...seatsInUse,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  action: z.enum(["change_tier", "cancel", "reactivate", "set_seats"]),
  tier: z.enum(["starter", "professional"]).optional(),
  seats: z.number().int().min(1).max(1000).optional(),
  billing: z.enum(["monthly", "annual"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.manage"
    );

    const body = await request.json();
    const { action, tier, billing, seats } = patchSchema.parse(body);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { stripeSubscriptionId: true, tier: true },
    });

    if (!workspace.stripeSubscriptionId) {
      return apiError("No active subscription", "NO_SUBSCRIPTION", 400);
    }

    switch (action) {
      case "change_tier": {
        if (!tier) {
          return apiError("Tier is required for change_tier", "MISSING_TIER", 400);
        }
        const config = getTierConfig(tier as WorkspaceTier);
        const priceId = billing === "annual"
          ? config.stripePriceIdAnnual
          : config.stripePriceIdMonthly;

        if (!priceId) {
          return apiError("Price not configured", "PRICE_NOT_FOUND", 400);
        }

        await changeTier(workspace.stripeSubscriptionId, priceId);
        return apiSuccess({ message: "Tier change initiated" });
      }

      case "cancel": {
        await cancelSubscription(workspace.stripeSubscriptionId);
        return apiSuccess({ message: "Subscription will cancel at period end" });
      }

      case "set_seats": {
        if (!seats) {
          return apiError("Seats are required for set_seats", "MISSING_SEATS", 400);
        }
        if (!TIER_LIMITS[workspace.tier as WorkspaceTier].seatBased) {
          return apiError("This plan is not billed per seat", "NOT_SEAT_BASED", 400);
        }
        await updateSeatCount(workspace.stripeSubscriptionId, seats);
        return apiSuccess({ message: "Seat change initiated" });
      }

      case "reactivate": {
        await reactivateSubscription(workspace.stripeSubscriptionId);
        return apiSuccess({ message: "Subscription reactivated" });
      }
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.manage"
    );

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { stripeSubscriptionId: true },
    });

    if (!workspace.stripeSubscriptionId) {
      return apiError("No active subscription", "NO_SUBSCRIPTION", 400);
    }

    await cancelSubscription(workspace.stripeSubscriptionId);

    return apiSuccess({ message: "Subscription will cancel at period end" });
  } catch (error) {
    return handleApiError(error);
  }
}
