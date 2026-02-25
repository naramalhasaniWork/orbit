"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Map,
  Workflow,
  ClipboardList,
  Play,
  ShieldCheck,
  Settings,
  Users,
  CreditCard,
  FolderGit2,
  KeyRound,
  Plug,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/components/team/workspace-switcher";

const navigation = [
  { name: "Agent", href: "/dashboard/agent", icon: Sparkles },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/dashboard/projects", icon: FolderGit2 },
  { name: "System Map", href: "/dashboard/map", icon: Map },
  { name: "Operations", href: "/dashboard/operations", icon: Workflow },
  { name: "Test Plans", href: "/dashboard/plans", icon: ClipboardList },
  { name: "Runs", href: "/dashboard/runs", icon: Play },
  { name: "Code Audit", href: "/dashboard/audit", icon: ShieldCheck },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Providers", href: "/dashboard/settings/providers", icon: KeyRound },
  { name: "MCP Tools", href: "/dashboard/settings/mcp", icon: Plug },
  { name: "Team", href: "/dashboard/settings/members", icon: Users },
  { name: "Billing", href: "/dashboard/settings/billing", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  return (
    <aside className="flex flex-col w-[52px] hover:w-52 transition-all duration-300 ease-in-out surface-1 border-r border-border group overflow-hidden">
      {/* Logo */}
      <div className="flex items-center h-14 px-3">
        <Logo size="sm" showText={false} className="shrink-0" />
        <span className="ml-2 font-semibold text-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          Orbit
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "text-foreground bg-orbit-accent/[0.08] border border-orbit-accent/[0.12]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-orbit-accent shadow-[0_0_8px_hsl(var(--orbit-accent)/0.5)]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                isActive && "text-orbit-accent"
              )} />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Workspace switcher */}
      <div className="p-2 mb-1">
        {workspaceId ? (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <WorkspaceSwitcher currentWorkspaceId={workspaceId} />
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer">
            <div className="h-6 w-6 rounded-md bg-orbit-accent/15 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-orbit-accent">
                O
              </span>
            </div>
            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap truncate">
              Workspace
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
