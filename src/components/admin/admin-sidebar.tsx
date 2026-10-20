"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { tween } from "@/lib/motion";
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings2,
  BarChart3,
  ScrollText,
  Shield,
  Orbit,
  Cpu,
  FileText,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Workspaces", href: "/admin/workspaces", icon: Building2 },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Models", href: "/admin/models", icon: Cpu },
  { name: "Prompts", href: "/admin/prompts", icon: FileText },
  { name: "System", href: "/admin/system", icon: Settings2 },
  { name: "Jobs", href: "/admin/jobs", icon: Inbox },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { name: "Audit Log", href: "/admin/audit", icon: ScrollText },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[52px] hover:w-52 transition-all duration-300 ease-in-out surface-1 border-r border-border group overflow-hidden">
      {/* Logo */}
      <div className="flex items-center h-14 px-3.5">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-tm-fail/15 shrink-0 shadow-[0_0_12px_rgba(239,68,68,0.15)]">
          <Shield className="h-4 w-4 text-tm-fail" />
        </div>
        <span className="ml-3 font-medium text-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          Admin Panel
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin/dashboard" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "text-foreground bg-foreground/[0.06]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="admin-sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-tm-fail shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  transition={tween.change}
                />
              )}
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                  isActive && "text-tm-fail"
                )}
              />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Back to dashboard */}
      <div className="p-2 mb-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-foreground/[0.04] transition-colors"
        >
          <div className="h-6 w-6 rounded-md bg-foreground/[0.06] flex items-center justify-center shrink-0">
            <Orbit className="h-3.5 w-3.5 text-foreground" />
          </div>
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Back to Dashboard
          </span>
        </Link>
      </div>
    </aside>
  );
}
