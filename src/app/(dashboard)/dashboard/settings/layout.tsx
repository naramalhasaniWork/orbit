import { Suspense } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";
import { RouteTransition } from "@/components/layout/route-transition";
import { settingsSections } from "@/components/layout/nav-model";
import { isSelfHosted } from "@/lib/self-host";

/** The heading and tabs hold still; only the section below them slides toward the tab picked. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const hideBilling = isSelfHosted();
  return (
    <>
      <h1 className="mb-4 text-balance text-[26px] font-medium leading-tight tracking-display">Settings</h1>
      <SettingsNav hideBilling={hideBilling} />
      <Suspense>
        <RouteTransition tabs={settingsSections({ hideBilling }).map((s) => s.href)}>{children}</RouteTransition>
      </Suspense>
    </>
  );
}
