import { stripe } from "./client";
import { prisma } from "@/lib/db";
import { getTierFromPriceId, getMonthlyCreditGrant } from "./prices";
import type { WorkspaceTier } from "@/lib/auth/tenant";
import { startFreePeriod } from "@/lib/billing/credit-periods";

export async function createSubscription(
  customerId: string,
  priceId: string,
  workspaceId: string,
  trialDays?: number
) {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata: { workspaceId },
    ...(trialDays ? { trial_period_days: trialDays } : {}),
  });

  return subscription;
}

export async function cancelSubscription(
  subscriptionId: string,
  cancelImmediately = false
) {
  if (cancelImmediately) {
    return stripe.subscriptions.cancel(subscriptionId);
  }

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function reactivateSubscription(subscriptionId: string) {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

export async function changeTier(
  subscriptionId: string,
  newPriceId: string
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    throw new Error("No subscription item found");
  }

  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: "create_prorations",
  });
}

/**
 * Set the seat count (subscription quantity). Stripe prorates the change;
 * the customer.subscription.updated webhook syncs seatCount back.
 */
export async function updateSeatCount(subscriptionId: string, seats: number) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    throw new Error("No subscription item found");
  }

  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, quantity: seats }],
    proration_behavior: "create_prorations",
  });
}

export async function syncSubscriptionToWorkspace(
  workspaceId: string,
  stripeSubscriptionId: string,
  priceId: string,
  status: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: boolean,
  seats: number
) {
  const tier = getTierFromPriceId(priceId) ?? "free";
  const monthlyCredits = getMonthlyCreditGrant(tier, seats);

  // Upsert the subscription record
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId },
    create: {
      workspaceId,
      stripeSubscriptionId,
      status: mapStripeStatus(status),
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      priceId,
      tier,
    },
    update: {
      status: mapStripeStatus(status),
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      priceId,
      tier,
    },
  });

  // Update workspace with billing info; limits come from TIER_LIMITS[tier]
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeSubscriptionId,
      stripePriceId: priceId,
      tier,
      billingPeriodStart: currentPeriodStart,
      billingPeriodEnd: currentPeriodEnd,
      seatCount: Math.max(1, seats),
      ...(monthlyCredits !== null ? { monthlyCredits } : {}),
    },
  });
}

export async function downgradeToFree(workspaceId: string) {
  const freeCredits = getMonthlyCreditGrant("free") ?? 0;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      tier: "free",
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      monthlyCredits: freeCredits,
      seatCount: 1,
    },
  });

  // The paid grant and its rollover expire; purchased credits stay
  await startFreePeriod(workspaceId);

  // Mark all subscriptions as canceled
  await prisma.subscription.updateMany({
    where: { workspaceId, status: { not: "canceled" } },
    data: { status: "canceled" },
  });
}

function mapStripeStatus(
  status: string
): "active" | "past_due" | "canceled" | "trialing" | "incomplete" | "unpaid" {
  const statusMap: Record<string, "active" | "past_due" | "canceled" | "trialing" | "incomplete" | "unpaid"> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    trialing: "trialing",
    incomplete: "incomplete",
    unpaid: "unpaid",
  };
  return statusMap[status] ?? "active";
}

export async function getSubscriptionForWorkspace(workspaceId: string) {
  return prisma.subscription.findFirst({
    where: { workspaceId, status: { not: "canceled" } },
    orderBy: { createdAt: "desc" },
  });
}
