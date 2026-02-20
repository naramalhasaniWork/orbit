"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  ClipboardList,
  Play,
  Settings,
  Orbit,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "System Map", href: "/dashboard/map", icon: Map },
  { name: "Test Plans", href: "/dashboard/plans", icon: ClipboardList },
  { name: "Runs", href: "/dashboard/runs", icon: Play },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[52px] hover:w-52 transition-all duration-300 ease-in-out surface-1 group overflow-hidden">
      {/* Logo */}
      <div className="flex items-center h-14 px-3.5">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-orbit-accent/15 shrink-0">
          <Orbit className="h-4 w-4 text-orbit-accent" />
        </div>
        <span className="ml-3 font-semibold text-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
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
                  ? "text-foreground bg-white/[0.06]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-orbit-accent" />
              )}
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Workspace badge */}
      <div className="p-2 mb-1">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer">
          <div className="h-6 w-6 rounded-md bg-orbit-accent/15 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-orbit-accent">
              O
            </span>
          </div>
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap truncate">
            Workspace
          </span>
        </div>
      </div>
    </aside>
  );
}
