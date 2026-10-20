"use client";

import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";
import { ChatOpenProvider } from "@/components/chat/chat-context";

/** Client-side state shared by the dashboard shell: shortcuts, breadcrumb label, mobile drawer. */
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ShortcutProvider>
      <BreadcrumbProvider>
        <MobileNavProvider>
          <ChatOpenProvider>{children}</ChatOpenProvider>
        </MobileNavProvider>
      </BreadcrumbProvider>
    </ShortcutProvider>
  );
}
