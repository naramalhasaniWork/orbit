import { PricingPageClient } from "./pricing-client";

export const metadata = {
  title: "Pricing - Orbit",
  description:
    "Simple, predictable pricing. Start free with 500 credits/month. Scale to Pro or Enterprise as your team grows.",
};

export default function PricingPage() {
  return <PricingPageClient />;
}
