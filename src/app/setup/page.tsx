import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isSelfHosted } from "@/lib/self-host";
import { countUsersOrZero, getSetupAccess, requestOrigin } from "@/lib/setup/access";
import { runSetupChecks } from "@/lib/setup/checks";
import { githubAppSettings } from "@/lib/setup/github-app";
import { SetupChecklist } from "@/components/setup/setup-checklist";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up · Orbit", robots: { index: false, follow: false } };

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  const access = getSetupAccess({
    selfHosted: isSelfHosted(),
    userCount: await countUsersOrZero(),
    signedIn: Boolean(session),
  });
  if (access === "login") redirect("/login");
  if (access === "dashboard") redirect("/dashboard");

  const origin = requestOrigin(await headers());
  const checks = await runSetupChecks({ origin });
  // Use the configured public URL for the GitHub App values; the checklist flags a mismatch
  const baseUrl = process.env.NEXTAUTH_URL?.trim() || origin;

  return <SetupChecklist checks={checks} github={githubAppSettings(baseUrl)} />;
}
