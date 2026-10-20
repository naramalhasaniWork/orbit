"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveHref, settingsSections } from "@/components/layout/nav-model";
import { cn } from "@/lib/utils";

/** The one Settings entry's sections: general, providers, MCP, team, billing. */
export function SettingsNav({ hideBilling }: { hideBilling: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
      {settingsSections({ hideBilling }).map((s) => {
        const active = isActiveHref(pathname, s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-9 shrink-0 items-center border-b-2 border-transparent px-2.5 text-[13px] font-medium text-tm-t2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-foreground text-foreground"
            )}
          >
            {s.name}
          </Link>
        );
      })}
    </nav>
  );
}
