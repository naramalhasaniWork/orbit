import Stripe from "stripe";

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

function createStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  return new Stripe(apiKey, {
    apiVersion: "2026-01-28.clover",
    typescript: true,
  });
}

/** Lazy Stripe client — only initializes when first accessed at runtime */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    if (!globalForStripe.stripe) {
      globalForStripe.stripe = createStripeClient();
    }
    return Reflect.get(globalForStripe.stripe, prop, receiver);
  },
});
