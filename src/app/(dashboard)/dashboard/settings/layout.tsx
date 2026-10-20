import { SettingsNav } from "@/components/settings/settings-nav";
import { isSelfHosted } from "@/lib/self-host";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsNav hideBilling={isSelfHosted()} />
      {children}
    </>
  );
}
