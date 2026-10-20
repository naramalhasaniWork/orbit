import { PricingPageClient } from "./pricing-client";
import { tierCreditsLabel } from "@/lib/auth/tier-limits";

export const metadata = {
  title: "Pricing - Orbit",
  description: `Simple, predictable pricing. Start free with ${tierCreditsLabel("free")}. Scale to Pro or Enterprise as your team grows.`,
};

export default function PricingPage() {
  return <PricingPageClient />;
}
