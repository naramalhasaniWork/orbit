import { stripe } from "./client";
import { getOrCreateStripeCustomer } from "./checkout";
import { prisma } from "@/lib/db";
import { CREDIT_PACKAGES, type CreditPackage } from "./credit-packages";
import { lockCredits, addPurchasedCredits } from "@/lib/billing/credit-buckets";

export function getCreditPackages(): CreditPackage[] {
  return CREDIT_PACKAGES;
}

export function getCreditPackageById(packageId: string): CreditPackage | null {
  return CREDIT_PACKAGES.find((p) => p.id === packageId) ?? null;
}

/**
 * Create a Stripe checkout session for a one-time credit purchase.
 * Returns the checkout URL.
 */
export async function createCreditCheckout(
  workspaceId: string,
  packageId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const creditPackage = getCreditPackageById(packageId);
  if (!creditPackage) {
    throw new Error(`Invalid credit package: ${packageId}`);
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      billingEmail: true,
    },
  });

  // Ensure Stripe customer exists
  const email = workspace.billingEmail ?? "";
  const customerId = await getOrCreateStripeCustomer(
    email,
    workspace.name,
    workspaceId,
    workspace.stripeCustomerId
  );

  // Persist customer ID if newly created
  if (!workspace.stripeCustomerId) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { stripeCustomerId: customerId, billingEmail: email },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: creditPackage.name,
            description: `${creditPackage.credits} Orbit credits`,
          },
          unit_amount: creditPackage.price,
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      workspaceId,
      type: "credit_purchase",
      packageId: creditPackage.id,
      credits: String(creditPackage.credits),
    },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session URL");
  }

  return session.url;
}

/**
 * Fulfill a credit purchase after checkout.session.completed webhook.
 * Adds the pack to the purchased bucket (never expires), at most once per
 * checkout session even when Stripe delivers the event concurrently.
 */
export async function fulfillCreditPurchase(
  workspaceId: string,
  credits: number,
  amountPaid: number,
  stripeSessionId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await lockCredits(tx, workspaceId);
    const fulfilled = await tx.creditTransaction.findFirst({
      where: { workspaceId, type: "purchase", metadata: { path: ["stripeSessionId"], equals: stripeSessionId } },
      select: { id: true },
    });
    if (fulfilled) return;

    await addPurchasedCredits(tx, workspaceId, locked, credits, {
      description: `Purchased ${credits} credits`,
      metadata: { stripeSessionId, amountPaid },
    });
  });
}

export type { CreditPackage };
