"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Logo } from "@/components/ui/logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClosingO } from "@/components/telemetry/closing-o";
import { LiveDot } from "@/components/telemetry/live-dot";
import { WorkspaceSwitcher } from "@/components/team/workspace-switcher";
import { useMobileNav } from "@/components/layout/mobile-nav-context";
import { useShortcutAction } from "@/components/shortcuts/shortcut-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LiveFavicon } from "@/components/layout/live-favicon";
import { LiveModule, RunModules } from "@/components/layout/sidebar-modules";
import { SETTINGS_LINK, SHORTCUTS, isActiveHref, withProjectParam, type NavLink } from "@/components/layout/nav-model";
import { useWorkspaceActivity } from "@/hooks/use-workspace-activity";
import { sidebarCookie } from "@/lib/sidebar-pref";
import { cn } from "@/lib/utils";

interface SidebarProps {
  /** From the cookie, so the server renders the right width. */
  initialExpanded?: boolean;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PANEL_ID = "orbit-sidebar";

/** Re-render on an interval only while something on screen reads the clock. */
function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function RailLink({ item, href, active }: { item: NavLink; href: string; active: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={item.name}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex size-10 items-center justify-center rounded-md text-tm-t2 transition-colors hover:bg-accent hover:text-foreground",
            active && "border border-border bg-card text-foreground",
            FOCUS
          )}
        >
          <item.icon aria-hidden="true" className="size-[18px]" strokeWidth={1.6} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.name}</TooltipContent>
    </Tooltip>
  );
}

function ListLink({ item, href, active }: { item: NavLink; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-tm-t2 transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
        FOCUS
      )}
    >
      <item.icon aria-hidden="true" className="size-4" strokeWidth={1.6} />
      {item.name}
    </Link>
  );
}

/**
 * Rail (64px) or expanded (320px) with live modules; toggled by the logo or `[`, persisted.
 * Below md it is an off-canvas drawer that always shows the expanded view.
 */
export function Sidebar({ initialExpanded = false }: SidebarProps) {
  const pathname = usePathname();
  const project = useSearchParams().get("project");
  const { data: session } = useSession();
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const { open, setOpen } = useMobileNav();
  const [expanded, setExpanded] = useState(initialExpanded);
  const { operations } = useWorkspaceActivity();
  const liveCount = operations.length;
  // Module bodies mount (and fetch) only once someone can see them.
  const showModules = expanded || open;
  const now = useNow(showModules ? (liveCount > 0 ? 1000 : 60_000) : null);

  function toggle() {
    if (window.matchMedia("(max-width: 767px)").matches) return setOpen(false);
    const next = !expanded;
    setExpanded(next);
    document.cookie = sidebarCookie(next);
  }
  useShortcutAction("sidebar", toggle);

  // Close the drawer after navigating, and on Escape.
  useEffect(() => setOpen(false), [pathname, setOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const link = (item: NavLink) => ({
    item,
    href: withProjectParam(item.href, project),
    active: isActiveHref(pathname, item.href),
  });
  const settingsActive = isActiveHref(pathname, SETTINGS_LINK.href, []);

  return (
    <TooltipProvider delayDuration={300}>
      <LiveFavicon live={liveCount > 0} />
      {open && (
        <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-drawer bg-tm-t1/30 md:hidden dark:bg-black/60" />
      )}

      {/* Rail: md and up, collapsed. */}
      {!expanded && (
        <nav aria-label="Primary" className="hidden w-16 shrink-0 flex-col items-center gap-1.5 py-3 md:flex">
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            aria-expanded={false}
            aria-controls={PANEL_ID}
            className={cn("mb-2 flex size-10 items-center justify-center rounded-md hover:bg-accent", FOCUS)}
          >
            <ClosingO size={26} state={liveCount > 0 ? "running" : "idle"} />
          </button>
          {liveCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/dashboard/runs"
                  aria-label={`Live runs, ${liveCount} running`}
                  className={cn("flex size-10 items-center justify-center rounded-md hover:bg-accent", FOCUS)}
                >
                  <LiveDot />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{liveCount} running</TooltipContent>
            </Tooltip>
          )}
          {SHORTCUTS.map((item) => (
            <RailLink key={item.href} {...link(item)} />
          ))}
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <ThemeToggle className="size-10" />
            <RailLink item={SETTINGS_LINK} href={SETTINGS_LINK.href} active={settingsActive} />
          </div>
        </nav>
      )}

      {/* Expanded panel; the off-canvas drawer below md. */}
      <aside
        id={PANEL_ID}
        aria-label="Primary"
        className={cn(
          "flex w-80 shrink-0 flex-col gap-3 overflow-hidden py-3 pl-2 pr-1",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-drawer max-md:max-w-[85vw] max-md:border-r max-md:border-border max-md:bg-background",
          "max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-[max(0.75rem,env(safe-area-inset-top))]",
          "max-md:transition-[transform,visibility] max-md:duration-open max-md:ease-out",
          open ? "max-md:visible max-md:translate-x-0" : "max-md:invisible max-md:-translate-x-full",
          !expanded && "md:hidden"
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label="Collapse sidebar"
          aria-expanded={true}
          aria-controls={PANEL_ID}
          className={cn("flex h-10 w-fit items-center rounded-md px-2 hover:bg-accent", FOCUS)}
        >
          <Logo size="md" state={liveCount > 0 ? "running" : "idle"} />
        </button>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {showModules && (
            <>
              <LiveModule operations={operations} now={now} />
              <RunModules now={now} />
            </>
          )}
          <nav aria-label="Shortcuts" className="mt-1 flex flex-col gap-0.5">
            {SHORTCUTS.map((item) => (
              <ListLink key={item.href} {...link(item)} />
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-2">
          {workspaceId && <WorkspaceSwitcher currentWorkspaceId={workspaceId} />}
          <div className="flex items-center gap-1">
            <ListLink item={SETTINGS_LINK} href={SETTINGS_LINK.href} active={settingsActive} />
            <ThemeToggle className="ml-auto" />
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
