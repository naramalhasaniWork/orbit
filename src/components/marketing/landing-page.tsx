import { LandingHero } from "./landing-hero";
import { LandingProof } from "./landing-proof";
import { DiffToJourneys, HowItWorks, SelfHost } from "./landing-sections";
import { PricingBand } from "./pricing-band";

export function LandingPage() {
  return (
    <>
      <LandingHero />
      <LandingProof />
      <HowItWorks />
      <DiffToJourneys />
      <SelfHost />
      <PricingBand />
    </>
  );
}
