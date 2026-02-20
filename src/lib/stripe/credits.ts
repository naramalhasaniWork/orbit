import { stripe } from "./client";
import { getOrCreateStripeCustomer } from "./checkout";
import { prisma } from "@/lib/db";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number; // in cents
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "credits-100", name: "100 Credits", credits: 100, price: 999 },
  { id: "credits-500", name: "500 Credits", credits: 500, price: 3999, popular: true },
  { id: "credits-1000", name: "1,000 Credits", credits: 1000, price: 6999 },
  { id: "credits-5000", name: "5,000 Credits", credits: 5000, price: 29999 },
];

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
 * Adds credits to workspace balance and records the transaction.
 */
export async function fulfillCreditPurchase(
  workspaceId: string,
  credits: number,
  amountPaid: number,
  stripeSessionId: string
): Promise<void> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { creditBalance: true },
  });

  const newBalance = workspace.creditBalance + credits;

  await prisma.$transaction([
    prisma.creditTransaction.create({
      data: {
        workspaceId,
        type: "purchase",
        amount: credits,
        balance: newBalance,
        description: `Purchased ${credits} credits`,
        metadata: {
          stripeSessionId,
          amountPaid,
        },
      },
    }),
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { creditBalance: { increment: credits } },
    }),
  ]);
}

export type { CreditPackage };
