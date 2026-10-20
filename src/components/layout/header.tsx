"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HealthBadge } from "./health-badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  ChevronDown,
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
import { StatusDot } from "@/components/shared/status-dot";
import { toneForHealth } from "@/lib/status-tone";
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
    <header className="relative flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-3 md:px-5">
      <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
          className="md:hidden flex size-9 shrink-0 items-center justify-center rounded-md text-tm-t2 hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu aria-hidden="true" className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div aria-hidden="true" className="flex size-5 items-center justify-center rounded-sm border border-border bg-muted">
                <span className="font-label text-[9px] text-tm-t2">
                  {active?.name?.charAt(0)?.toUpperCase() ?? "P"}
                </span>
              </div>
              <span className="max-w-[110px] sm:max-w-[140px] truncate">
                {active?.name ?? "Select Project"}
              </span>
              <ChevronDown aria-hidden="true" className="size-3.5 text-tm-t3" />
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
                  <StatusDot
                    status={
                      !project.onboardingCompleted
                        ? "untested"
                        : ({ pass: "pass", fail: "fail", flaky: "flaky" } as const)[
                            toneForHealth(project.healthStatus) as "pass" | "fail" | "flaky"
                          ] ?? "untested"
                    }
                  />
                  <span className="truncate flex-1">{project.name}</span>
                  {!project.onboardingCompleted ? (
                    <span className="text-[11px] text-tm-t3">Setting up</span>
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

        <span aria-hidden="true" className="hidden sm:inline text-[13px] text-tm-line-strong">/</span>
        <span className="hidden sm:inline truncate text-[13px] text-tm-t2">{title}</span>

        <div className="hidden sm:block">
          <HealthBadge projectStatus={healthStatus ?? active?.healthStatus} />
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
            className="flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md border border-tm-line-strong px-2 text-xs text-tm-t2 transition-colors hover:bg-accent sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="font-label">○</span>
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
              aria-busy={starting || undefined}
              className="h-8 min-w-8 gap-1.5 px-2 text-[13px] sm:px-3 disabled:cursor-not-allowed"
            >
              <Play aria-hidden="true" className="size-3" />
              <span className="hidden sm:inline">{starting ? "Starting" : "Run"}</span>
            </Button>
          </span>
        )}

        <UserMenu />
      </div>

      {runError && (
        <div
          role="alert"
          className="absolute right-3 md:right-5 top-full mt-2 z-toast w-[min(320px,calc(100vw-1.5rem))] rounded-lg border border-tm-fail/40 bg-popover px-3 py-2.5 shadow-elevated"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-px shrink-0 font-label text-xs text-tm-fail">✕</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-snug">
                {runError.message}
              </p>
              {runError.cta && (
                <Link
                  href={runError.cta.href}
                  onClick={() => setRunError(null)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-foreground underline underline-offset-4 decoration-tm-line-strong hover:decoration-foreground"
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
