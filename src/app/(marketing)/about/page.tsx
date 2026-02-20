import { AboutPageClient } from "./about-client";

export const metadata = {
  title: "About - Orbit",
  description:
    "Orbit was born from a simple frustration: AI helps you write code 10x faster, but testing hasn't kept up. We're fixing that.",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
