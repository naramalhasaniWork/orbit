"use client";

import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { FeatureGrid } from "./feature-card";
import { ProductShowcase } from "./product-showcase";
import { CtaSection } from "./cta-section";

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorks />
      <FeatureGrid />
      <ProductShowcase />
      <CtaSection />
    </>
  );
}
