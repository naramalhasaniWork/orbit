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
} from "@/lib/stripe/subscriptions";
import { getTierConfig } from "@/lib/stripe/prices";
import type { WorkspaceTier } from "@/lib/auth/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      request.headers.get("x-workspace-id") ?? "",
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
        monthlyCredits: true,
      },
    });

    const subscription = await getSubscriptionForWorkspace(ctx.workspaceId);

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
      monthlyCredits: workspace.monthlyCredits,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  action: z.enum(["change_tier", "cancel", "reactivate"]),
  tier: z.enum(["starter", "professional"]).optional(),
  billing: z.enum(["monthly", "annual"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      request.headers.get("x-workspace-id") ?? "",
      "billing.manage"
    );

    const body = await request.json();
    const { action, tier, billing } = patchSchema.parse(body);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { stripeSubscriptionId: true },
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
      request.headers.get("x-workspace-id") ?? "",
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
