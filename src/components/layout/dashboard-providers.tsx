"use client";

import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";
import { ChatOpenProvider } from "@/components/chat/chat-context";
import { BugReportProvider } from "@/components/bug-report/bug-report-provider";

/** Client-side state shared by the dashboard shell: shortcuts, breadcrumb label, mobile drawer, bug reports. */
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ShortcutProvider>
      <BugReportProvider>
        <BreadcrumbProvider>
          <MobileNavProvider>
            <ChatOpenProvider>{children}</ChatOpenProvider>
          </MobileNavProvider>
        </BreadcrumbProvider>
      </BugReportProvider>
    </ShortcutProvider>
  );
}
