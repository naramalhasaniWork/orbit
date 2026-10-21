import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { LandingPage } from "@/components/marketing/landing-page";
import { isSelfHosted } from "@/lib/self-host";
import { isSetupOpen } from "@/lib/setup/access";
import type { Metadata } from "next";
import { SITE, pageTitle } from "@/lib/marketing/site";
import { softwareApplicationJsonLd } from "@/lib/marketing/json-ld";

export const metadata: Metadata = {
  title: pageTitle(),
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: { url: "/", title: pageTitle(), description: SITE.description },
};

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }
  // Self-hosted instances have no marketing site
  if (isSelfHosted()) {
    // A brand-new instance starts at the setup checklist
    redirect((await isSetupOpen()) ? "/setup" : "/login");
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <LandingPage />
      </main>
      <script
        type="application/ld+json"
        // Static, server-built object; JSON.stringify escapes it. "<" is escaped so it can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd()).replace(/</g, "\\u003c") }}
      />
      <MarketingFooter />
    </div>
  );
}
