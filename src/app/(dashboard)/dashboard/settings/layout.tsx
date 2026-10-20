import { SettingsNav } from "@/components/settings/settings-nav";
import { isSelfHosted } from "@/lib/self-host";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-balance text-[26px] font-medium leading-tight tracking-display">Settings</h1>
      <SettingsNav hideBilling={isSelfHosted()} />
      {children}
    </>
  );
}
