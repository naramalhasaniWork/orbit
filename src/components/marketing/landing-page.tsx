"use client";

import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { FeatureGrid } from "./feature-card";
import { ComparisonTable } from "./comparison-table";
import { PricingSection } from "./pricing-section";
import { CtaSection } from "./cta-section";
import heroContent from "@/app/(marketing)/content/hero.json";
import landingContent from "@/app/(marketing)/content/landing.json";
import pricingContent from "@/app/(marketing)/content/pricing.json";

export function LandingPage() {
  return (
    <>
      <HeroSection content={{ ...heroContent.primary, social_proof_bar: heroContent.social_proof_bar }} />

      <HowItWorks content={landingContent.howItWorks} />

      <FeatureGrid content={landingContent.features} />

      <ComparisonTable content={landingContent.comparison} />

      <PricingSection content={pricingContent} />

      <CtaSection content={landingContent.cta} />
    </>
  );
}
