"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { useMobileNav } from "@/components/layout/mobile-nav-context";

const BILLING_HREF = "/dashboard/settings/billing";

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
  { name: "Billing", href: BILLING_HREF, icon: CreditCard },
];

interface SidebarProps {
  /** Hide the billing entry (self-hosted instances have no billing). */
  hideBilling?: boolean;
}

export function Sidebar({ hideBilling = false }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const projectParam = searchParams.get("project");
  const navItems = hideBilling
    ? navigation.filter((item) => item.href !== BILLING_HREF)
    : navigation;
  const { open, setOpen } = useMobileNav();

  // Close the drawer after navigating, and on Escape.
  useEffect(() => setOpen(false), [pathname, setOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
    {open && (
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
      />
    )}
    {/* Below md the sidebar is an off-canvas drawer; from md up it is the pinned icon rail. */}
    <aside
      aria-label="Primary"
      className={cn(
        "flex flex-col surface-1 border-r border-border group overflow-hidden",
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-60 max-md:transition-[transform,visibility] max-md:duration-200",
        open ? "max-md:translate-x-0 max-md:visible" : "max-md:-translate-x-full max-md:invisible",
        "md:w-14 md:hover:w-60 md:transition-all md:duration-300 md:ease-in-out"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3">
        <Logo size="sm" showText={false} className="shrink-0" />
        <span className="ml-2 font-semibold text-sm text-foreground max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          Orbit
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));

          const href = projectParam && !item.href.includes("/settings")
            ? `${item.href}?project=${projectParam}`
            : item.href;

          return (
            <Link
              key={item.name}
              href={href}
              className={cn(
                "relative flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "text-foreground bg-orbit-accent/[0.08] border border-orbit-accent/[0.12]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
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
              <span className="max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Workspace switcher */}
      <div className="p-2 mb-1">
        {workspaceId ? (
          <div className="max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
            <WorkspaceSwitcher currentWorkspaceId={workspaceId} />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-foreground/[0.06] transition-colors cursor-pointer">
            <div className="h-6 w-6 rounded-md bg-orbit-accent/15 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-orbit-accent">
                O
              </span>
            </div>
            <span className="text-xs text-muted-foreground max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap truncate">
              Workspace
            </span>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
