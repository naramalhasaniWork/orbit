import { stripe } from "./client";
import { prisma } from "@/lib/db";
import { getTierFromPriceId, getTierLimits } from "./prices";
import type { WorkspaceTier } from "@/lib/auth/tenant";

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

export async function syncSubscriptionToWorkspace(
  workspaceId: string,
  stripeSubscriptionId: string,
  priceId: string,
  status: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: boolean
) {
  const tier = getTierFromPriceId(priceId) ?? "free";
  const limits = getTierLimits(tier);

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

  // Update workspace with billing info and tier limits
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeSubscriptionId,
      stripePriceId: priceId,
      tier,
      billingPeriodStart: currentPeriodStart,
      billingPeriodEnd: currentPeriodEnd,
      monthlyCredits: limits.monthlyCredits,
      ...(limits.maxProjects > 0 ? { projectLimit: limits.maxProjects } : {}),
      ...(limits.maxMembers > 0 ? { memberLimit: limits.maxMembers } : {}),
    },
  });
}

export async function downgradeToFree(workspaceId: string) {
  const freeLimits = getTierLimits("free");

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      tier: "free",
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      monthlyCredits: freeLimits.monthlyCredits,
      projectLimit: freeLimits.maxProjects,
      memberLimit: freeLimits.maxMembers,
    },
  });

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
