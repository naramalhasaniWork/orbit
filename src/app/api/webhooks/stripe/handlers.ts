import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db";
import { syncSubscriptionToWorkspace, downgradeToFree } from "@/lib/stripe/subscriptions";
import { getTierLimits } from "@/lib/stripe/prices";
import { fulfillCreditPurchase } from "@/lib/stripe/credits";
import type Stripe from "stripe";

/** Extract period dates from a Stripe Subscription (API version compat) */
function getSubscriptionPeriod(sub: Stripe.Subscription) {
  const data = sub as unknown as Record<string, unknown>;
  const start = (data.current_period_start as number) ?? Math.floor(Date.now() / 1000);
  const end = (data.current_period_end as number) ?? Math.floor(Date.now() / 1000);
  const cancelAtPeriodEnd = (data.cancel_at_period_end as boolean) ?? false;
  return { start, end, cancelAtPeriodEnd };
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) {
    console.warn("[Stripe Webhook] checkout.session.completed missing workspaceId");
    return;
  }

  // Handle credit purchase (one-time payment, no subscription)
  if (session.metadata?.type === "credit_purchase") {
    await handleCreditPurchase(session, workspaceId);
    return;
  }

  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? "";

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeCustomerId: typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null,
      billingEmail: session.customer_email ?? undefined,
    },
  });

  const period = getSubscriptionPeriod(subscription);
  await syncSubscriptionToWorkspace(
    workspaceId,
    subscriptionId,
    priceId,
    subscription.status,
    new Date(period.start * 1000),
    new Date(period.end * 1000),
    period.cancelAtPeriodEnd
  );
}

async function handleCreditPurchase(
  session: Stripe.Checkout.Session,
  workspaceId: string
) {
  const credits = parseInt(session.metadata?.credits ?? "0", 10);
  if (credits <= 0) {
    console.warn("[Stripe Webhook] credit purchase with 0 credits");
    return;
  }

  const amountPaid = session.amount_total ?? 0;
  await fulfillCreditPurchase(workspaceId, credits, amountPaid, session.id);

  await prisma.auditLog.create({
    data: {
      workspaceId,
      action: "billing.credits_purchased",
      resourceType: "credit_transaction",
      resourceId: session.id,
      metadata: {
        credits,
        amountPaid,
        packageId: session.metadata?.packageId ?? null,
      },
    },
  });
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const workspace = await prisma.workspace.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!workspace) return;

  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      workspaceId: workspace.id,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status ?? "paid",
      pdfUrl: invoice.invoice_pdf ?? null,
      periodStart: new Date(invoice.period_start * 1000),
      periodEnd: new Date(invoice.period_end * 1000),
    },
    update: {
      amount: invoice.amount_paid,
      status: invoice.status ?? "paid",
      pdfUrl: invoice.invoice_pdf ?? null,
    },
  });

  const tier = workspace.tier;
  const limits = getTierLimits(tier);

  await prisma.creditTransaction.create({
    data: {
      workspaceId: workspace.id,
      type: "monthly_grant",
      amount: limits.monthlyCredits,
      balance: workspace.creditBalance + limits.monthlyCredits,
      description: `Monthly credit grant (${tier} plan)`,
    },
  });

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { creditBalance: { increment: limits.monthlyCredits } },
  });
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const workspace = await prisma.workspace.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!workspace) return;

  if (workspace.stripeSubscriptionId) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: workspace.stripeSubscriptionId },
      data: { status: "past_due" },
    });
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      action: "billing.payment_failed",
      resourceType: "invoice",
      resourceId: invoice.id,
      metadata: {
        amount: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
      },
    },
  });
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) {
    const customerId = typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

    if (!customerId) return;

    const workspace = await prisma.workspace.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!workspace) return;

    const priceId = subscription.items.data[0]?.price.id ?? "";
    const p = getSubscriptionPeriod(subscription);
    await syncSubscriptionToWorkspace(
      workspace.id,
      subscription.id,
      priceId,
      subscription.status,
      new Date(p.start * 1000),
      new Date(p.end * 1000),
      p.cancelAtPeriodEnd
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price.id ?? "";
  const p = getSubscriptionPeriod(subscription);
  await syncSubscriptionToWorkspace(
    workspaceId,
    subscription.id,
    priceId,
    subscription.status,
    new Date(p.start * 1000),
    new Date(p.end * 1000),
    p.cancelAtPeriodEnd
  );
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return;

  const workspace = await prisma.workspace.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!workspace) return;

  await downgradeToFree(workspace.id);

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      action: "billing.subscription_cancelled",
      resourceType: "subscription",
      resourceId: subscription.id,
    },
  });
}
