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
 * Change the seat count (subscription quantity). An increase is invoiced at
 * once and only takes effect when that invoice is paid
 * (pending_if_incomplete), so seats are never granted unpaid; the webhook
 * sync then raises seatCount and invoice.paid grants the prorated credits.
 * A decrease is not prorated: removed seats stop billing at renewal, so there
 * is no mid-period refund and no credit clawback.
 */
export async function updateSeatCount(subscriptionId: string, seats: number) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];

  if (!item) {
    throw new Error("No subscription item found");
  }

  const increase = seats > (item.quantity ?? 1);
  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, quantity: seats }],
    ...(increase
      ? { proration_behavior: "always_invoice", payment_behavior: "pending_if_incomplete" }
      : { proration_behavior: "none" }),
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

type MirroredStatus = "active" | "past_due" | "canceled" | "trialing" | "incomplete" | "unpaid";

/** Stripe statuses we mirror as-is or map; nothing outside this list may become granting. */
const STATUS_ALLOWLIST: Record<string, MirroredStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "unpaid",
  incomplete: "incomplete",
  canceled: "canceled",
  incomplete_expired: "canceled",
};

/**
 * Fails closed: paused, or any status Stripe adds later, is stored as unpaid,
 * which grants nothing and lets the subscription be reactivated by a later sync.
 */
export function mapStripeStatus(status: string): MirroredStatus {
  return STATUS_ALLOWLIST[status] ?? "unpaid";
}

export async function getSubscriptionForWorkspace(workspaceId: string) {
  return prisma.subscription.findFirst({
    where: { workspaceId, status: { not: "canceled" } },
    orderBy: { createdAt: "desc" },
  });
}
