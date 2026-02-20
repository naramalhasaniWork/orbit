import { stripe } from "./client";

interface CreateCheckoutParams {
  workspaceId: string;
  customerId: string;
  priceId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}

export async function createCheckoutSession(params: CreateCheckoutParams) {
  const { workspaceId, customerId, priceId, quantity, successUrl, cancelUrl, trialDays } = params;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: quantity ?? 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { workspaceId },
    subscription_data: {
      metadata: { workspaceId },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
    allow_promotion_codes: true,
  });

  return session;
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

export async function getOrCreateStripeCustomer(
  email: string,
  name: string,
  workspaceId: string,
  existingCustomerId?: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { workspaceId },
  });

  return customer.id;
}
