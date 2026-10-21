import type { Metadata } from "next";
import { PricingPageClient } from "./pricing-client";
import { PricingBand } from "@/components/marketing/pricing-band";

const description = "Self-hosting is free. Hosted Orbit is priced per seat, with monthly credits that roll over for one month.";

export const metadata: Metadata = {
  title: "Pricing · Orbit",
  description,
  alternates: { canonical: "/pricing" },
  twitter: { title: "Pricing · Orbit", description },
  openGraph: { url: "/pricing", title: "Pricing · Orbit", description },
};

export default function PricingPage() {
  return (
    <>
      <PricingBand headingLevel="h1" />
      <PricingPageClient />
    </>
  );
}
