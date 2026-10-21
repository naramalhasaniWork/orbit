"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings2,
  BarChart3,
  ScrollText,
  ArrowLeft,
  Cpu,
  FileText,
  Inbox,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClosingO } from "@/components/telemetry/closing-o";

const navigation = [
  { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Workspaces", href: "/admin/workspaces", icon: Building2 },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Models", href: "/admin/models", icon: Cpu },
  { name: "Prompts", href: "/admin/prompts", icon: FileText },
  { name: "System", href: "/admin/system", icon: Settings2 },
  { name: "Jobs", href: "/admin/jobs", icon: Inbox },
  { name: "Reports", href: "/admin/reports", icon: Bug },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { name: "Audit Log", href: "/admin/audit", icon: ScrollText },
];

/** Counts shown beside a nav item, keyed by href (e.g. open bug reports). */
export function AdminSidebar({ counts = {} }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname();

  return (
    <aside aria-label="Admin" className="flex w-14 shrink-0 flex-col overflow-hidden border-r border-border bg-background md:w-52">
      {/* Logo */}
      <div className="flex items-center h-14 px-3.5">
        <ClosingO size={24} />
        <span className="ml-2.5 hidden whitespace-nowrap text-sm font-medium md:inline">Admin</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navigation.map((item) => {
          const count = counts[item.href] ?? 0;
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin/dashboard" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              title={item.name}
              className={cn(
                "relative flex h-9 items-center gap-3 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-accent text-foreground" : "text-tm-t2 hover:bg-accent hover:text-foreground"
              )}
            >

              <item.icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.6} />
              <span className="sr-only whitespace-nowrap md:not-sr-only">
                {item.name}
              </span>
              {count > 0 && (
                <span className="tm-num absolute right-1 top-1 rounded-sm bg-tm-live/10 px-1 text-[10px] leading-4 text-tm-live-text md:static md:ml-auto md:text-[11px]">
                  <span className="sr-only">, </span>
                  {count > 99 ? "99+" : count}
                  <span className="sr-only"> open</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Back to dashboard */}
      <div className="p-2 mb-1">
        <Link
          href="/dashboard"
          title="Back to the app"
          className="flex h-9 items-center gap-3 rounded-md px-2 text-[13px] text-tm-t2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.6} />
          <span className="sr-only whitespace-nowrap md:not-sr-only">Back to the app</span>
        </Link>
      </div>
    </aside>
  );
}
