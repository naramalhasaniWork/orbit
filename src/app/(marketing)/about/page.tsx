import type { Metadata } from "next";
import { ProsePage, ProseRow } from "@/components/marketing/prose-page";
import about from "@/app/(marketing)/content/about.json";

export const metadata: Metadata = {
  title: "About · Orbit",
  description: about.subheadline,
  alternates: { canonical: "/about" },
  twitter: { title: "About · Orbit", description: about.subheadline },
  openGraph: { url: "/about", title: "About · Orbit", description: about.subheadline },
};

export default function AboutPage() {
  return (
    <ProsePage eyebrow="About" title={about.headline} lead={about.subheadline}>
      <ProseRow label="The problem" title="Which parts of the app did this PR touch, and do they still work?">
        {about.story.paragraphs.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </ProseRow>
      {about.values.map((v) => (
        <ProseRow key={v.title} label="Principle" title={v.title}>
          <p>{v.description}</p>
        </ProseRow>
      ))}
    </ProsePage>
  );
}
