import type { Metadata } from "next";
import { openGraphFor } from "@/lib/marketing/site";
import { ProsePage, ProseRow } from "@/components/marketing/prose-page";
import features from "@/app/(marketing)/content/features.json";

export const metadata: Metadata = {
  title: "Features · Orbit",
  description: features.subheadline,
  alternates: { canonical: "/features" },
  twitter: { title: "Features · Orbit", description: features.subheadline },
  openGraph: openGraphFor("/features", "Features · Orbit", features.subheadline),
};

export default function FeaturesPage() {
  return (
    <ProsePage eyebrow="Features" title={features.headline} lead={features.subheadline}>
      {features.features.map((f) => (
        <ProseRow key={f.id} label={f.label} title={f.title}>
          <p id={f.id}>{f.description}</p>
        </ProseRow>
      ))}
    </ProsePage>
  );
}
