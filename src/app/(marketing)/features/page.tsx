import { FeaturesPageClient } from "./features-client";

export const metadata = {
  title: "Features - Orbit",
  description:
    "Explore Orbit's AI-native testing features: System Map, self-healing selectors, code-aware planning, live execution, and more.",
};

export default function FeaturesPage() {
  return <FeaturesPageClient />;
}
