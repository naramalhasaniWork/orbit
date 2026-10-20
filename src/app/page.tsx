import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { LandingPage } from "@/components/marketing/landing-page";
import { isSelfHosted } from "@/lib/self-host";
import { isSetupOpen } from "@/lib/setup/access";

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
    <div className="min-h-screen flex flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <LandingPage />
      </main>
      <MarketingFooter />
    </div>
  );
}
