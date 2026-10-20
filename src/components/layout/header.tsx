"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HealthBadge } from "./health-badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  ChevronDown,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { UserMenu } from "@/components/layout/user-menu";
import { useBreadcrumbValue } from "@/components/layout/breadcrumb-context";
import { useMobileNav } from "@/components/layout/mobile-nav-context";
import { useShortcutAction } from "@/components/shortcuts/shortcut-provider";
import { useStartRun } from "@/hooks/use-start-run";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface HeaderProject {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  healthStatus: string;
  onboardingCompleted: boolean;
  status: string;
  hasEnvironment: boolean;
  hasActivePlan: boolean;
}

interface HeaderProps {
  projects?: HeaderProject[];
  activeProjectId?: string | null;
  healthStatus?: "healthy" | "degraded" | "failing";
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/map": "System Map",
  "/dashboard/plans": "Test Plans",
  "/dashboard/runs": "Runs",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/members": "Team Members",
  "/dashboard/settings/billing": "Billing & Usage",
  "/dashboard/onboarding": "Onboarding",
  "/dashboard/profile": "Profile",
};

const healthDot: Record<string, string> = {
  healthy: "bg-orbit-pass",
  degraded: "bg-orbit-flaky",
  failing: "bg-orbit-fail",
};

function getPageTitle(pathname: string | null): string {
  if (!pathname) return "Dashboard";
  if (pathname.startsWith("/dashboard/runs/")) return "Run Detail";
  if (pathname.startsWith("/dashboard/projects/")) return "Project";
  return PAGE_TITLES[pathname] ?? "Dashboard";
}

export function Header({ projects = [], activeProjectId, healthStatus }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const breadcrumbLabel = useBreadcrumbValue();
  const { setOpen: setNavOpen } = useMobileNav();
  const title = breadcrumbLabel ?? getPageTitle(pathname);

  const active = projects.find((p) => p.id === activeProjectId);

  const { starting, runError, setRunError, startRun } = useStartRun(activeProjectId);

  // A project is still being set up until onboarding (index + first plan) completes.
  const isSettingUp = !!active && !active.onboardingCompleted;
  const blockReason: string | null = !active
    ? null
    : !active.onboardingCompleted
    ? "Finish setup for this project before running tests."
    : !active.hasEnvironment
    ? "Add a non-production environment in Settings to run tests."
    : !active.hasActivePlan
    ? "Generate a test plan before running tests."
    : null;

  // "R" shortcut: same gate as the Run button, but say why when blocked.
  useShortcutAction(
    "run",
    active && !isSettingUp
      ? () => (blockReason ? setRunError({ message: blockReason }) : startRun())
      : undefined
  );

  function handleSelectProject(projectId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectId);
    const basePath = pathname ?? "/dashboard";
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <header className="relative flex items-center justify-between gap-2 h-12 px-3 md:px-6 surface-1 border-b border-border shrink-0">
      <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
          className="md:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium text-foreground hover:bg-white/[0.06] transition-colors min-w-0">
              <div className="h-5 w-5 rounded bg-orbit-accent/15 flex items-center justify-center">
                <span className="text-[9px] font-bold text-orbit-accent">
                  {active?.name?.charAt(0)?.toUpperCase() ?? "P"}
                </span>
              </div>
              <span className="max-w-[110px] sm:max-w-[140px] truncate">
                {active?.name ?? "Select Project"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Projects
            </DropdownMenuLabel>
            {projects
              .filter((p) => p.status === "active")
              .map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => {
                    if (!project.onboardingCompleted) {
                      router.push(`/dashboard/onboarding?project=${project.id}`);
                    } else {
                      handleSelectProject(project.id);
                    }
                  }}
                  className={cn(
                    "gap-2 cursor-pointer",
                    project.id === activeProjectId && "bg-accent"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      !project.onboardingCompleted
                        ? "bg-orbit-accent animate-pulse"
                        : healthDot[project.healthStatus] ?? "bg-muted-foreground"
                    )}
                  />
                  <span className="truncate flex-1">{project.name}</span>
                  {!project.onboardingCompleted ? (
                    <span className="text-[10px] text-orbit-accent">Setting up...</span>
                  ) : project.framework ? (
                    <span className="text-xs text-muted-foreground">
                      {project.framework}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            {projects.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-muted-foreground cursor-pointer"
              onClick={() => router.push("/dashboard/onboarding")}
            >
              Add project...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="hidden sm:inline text-muted-foreground/40 text-sm">/</span>
        <span className="hidden sm:inline text-sm text-muted-foreground truncate">{title}</span>

        <div className="hidden sm:block">
          <HealthBadge status={healthStatus ?? (active?.healthStatus as "healthy" | "degraded" | "failing") ?? "healthy"} />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <QuickActions
          projectId={activeProjectId ?? undefined}
          projectName={active?.name}
          onTriggerRun={activeProjectId ? startRun : undefined}
        />

        {isSettingUp && activeProjectId ? (
          <Link
            href={`/dashboard/onboarding?project=${activeProjectId}`}
            title="This project is still indexing. Finish setup to run tests."
            aria-label="Setting up"
            className="flex items-center justify-center gap-1.5 h-8 w-8 sm:h-7 sm:w-auto sm:px-3 text-xs rounded-md border border-orbit-accent/30 bg-orbit-accent/10 text-orbit-accent hover:bg-orbit-accent/15 transition-colors"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">Setting up</span>
          </Link>
        ) : (
          // Wrapping span keeps the tooltip visible even when the button is disabled.
          <span title={blockReason ?? undefined} className="inline-flex">
            <Button
              size="sm"
              disabled={!activeProjectId || !!blockReason || starting}
              onClick={startRun}
              aria-label={starting ? "Starting run" : "Run tests"}
              className="h-8 w-8 p-0 sm:h-7 sm:w-auto sm:px-3 text-xs bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5 rounded-md shadow-[0_0_12px_hsl(var(--orbit-accent)/0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {starting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">{starting ? "Starting" : "Run"}</span>
            </Button>
          </span>
        )}

        <UserMenu />
      </div>

      {runError && (
        <div
          role="alert"
          className="absolute right-3 md:right-6 top-full mt-2 z-50 w-[min(320px,calc(100vw-1.5rem))] rounded-lg border border-orbit-fail/40 bg-orbit-fail/[0.08] backdrop-blur px-3 py-2.5 shadow-lg"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-orbit-fail mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-snug">
                {runError.message}
              </p>
              {runError.cta && (
                <Link
                  href={runError.cta.href}
                  onClick={() => setRunError(null)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-orbit-accent hover:text-orbit-accent/80"
                >
                  {runError.cta.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => setRunError(null)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
