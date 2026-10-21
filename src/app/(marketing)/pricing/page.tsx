import type { Metadata } from "next";
import { PricingPageClient } from "./pricing-client";
import { PricingBand } from "@/components/marketing/pricing-band";
import { openGraphFor } from "@/lib/marketing/site";

const description = "Self-hosting is free. Hosted Orbit is priced per seat, with monthly credits that roll over for one month.";

export const metadata: Metadata = {
  title: "Pricing · Orbit",
  description,
  alternates: { canonical: "/pricing" },
  twitter: { title: "Pricing · Orbit", description },
  openGraph: openGraphFor("/pricing", "Pricing · Orbit", description),
};

export default function PricingPage() {
  return (
    <>
      <PricingBand headingLevel="h1" />
      <PricingPageClient />
    </>
  );
}
