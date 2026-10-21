import { getTierConfig } from "@/lib/stripe/prices";
import { SITE } from "@/lib/marketing/site";

/** SoftwareApplication for the landing page. Offers mirror the rendered pricing band; no ratings or reviews. */
export function softwareApplicationJsonLd() {
  const seat = (tier: "starter" | "professional") => {
    const c = getTierConfig(tier);
    return {
      "@type": "Offer",
      name: c.name,
      price: String(c.priceMonthly),
      priceCurrency: "USD",
      description: "Per seat, per month",
    };
  };
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: [
      { "@type": "Offer", name: "Self-hosted", price: "0", priceCurrency: "USD" },
      seat("starter"),
      seat("professional"),
    ],
  };
}
