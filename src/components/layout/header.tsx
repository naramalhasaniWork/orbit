"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useCallback, useState } from "react";
import { HealthBadge } from "./health-badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  ChevronDown,
  User,
  Settings,
  Shield,
  LogOut,
  Loader2,
  AlertTriangle,
  ArrowRight,
  X,
} from "lucide-react";
import { QuickActions } from "@/components/dashboard/quick-actions";
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

interface RunError {
  message: string;
  cta?: { label: string; href: string };
}

/** Map a run-trigger API error code to an actionable CTA link for this project. */
function ctaForRunError(
  code: string | undefined,
  projectId: string
): RunError["cta"] {
  switch (code) {
    case "NO_ENVIRONMENT":
      return {
        label: "Configure environment",
        href: `/dashboard/settings?project=${projectId}&tab=environments`,
      };
    case "NO_TEST_PLAN":
      return {
        label: "View test plans",
        href: `/dashboard/plans?project=${projectId}`,
      };
    case "LIMIT_REACHED":
      return { label: "View billing", href: "/dashboard/settings/billing" };
    default:
      return undefined;
  }
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
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const title = getPageTitle(pathname);

  const active = projects.find((p) => p.id === activeProjectId);

  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<RunError | null>(null);

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

  const startRun = useCallback(async () => {
    if (!activeProjectId || starting) return;
    setRunError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const id = (json as { data?: { id?: string } }).data?.id;
        router.push(
          id
            ? `/dashboard/runs/${id}`
            : `/dashboard/runs?project=${activeProjectId}`
        );
        return;
      }
      const err = (json as { error?: { message?: string; code?: string } }).error;
      setRunError({
        message: err?.message ?? `Failed to start run (${res.status})`,
        cta: ctaForRunError(err?.code, activeProjectId),
      });
    } catch {
      setRunError({
        message: "Failed to start run. Check your connection and try again.",
      });
    } finally {
      setStarting(false);
    }
  }, [activeProjectId, starting, router]);

  function handleSelectProject(projectId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectId);
    const basePath = pathname ?? "/dashboard";
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <header className="relative flex items-center justify-between h-12 px-6 surface-1 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium text-foreground hover:bg-white/[0.06] transition-colors">
              <div className="h-5 w-5 rounded bg-orbit-accent/15 flex items-center justify-center">
                <span className="text-[9px] font-bold text-orbit-accent">
                  {active?.name?.charAt(0)?.toUpperCase() ?? "P"}
                </span>
              </div>
              <span className="max-w-[140px] truncate">
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

        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm text-muted-foreground">{title}</span>

        <HealthBadge status={healthStatus ?? (active?.healthStatus as "healthy" | "degraded" | "failing") ?? "healthy"} />
      </div>

      <div className="flex items-center gap-2">
        <QuickActions
          projectId={activeProjectId ?? undefined}
          projectName={active?.name}
          onTriggerRun={activeProjectId ? startRun : undefined}
        />

        {isSettingUp && activeProjectId ? (
          <Link
            href={`/dashboard/onboarding?project=${activeProjectId}`}
            title="This project is still indexing. Finish setup to run tests."
            className="flex items-center gap-1.5 h-7 px-3 text-xs rounded-md border border-orbit-accent/30 bg-orbit-accent/10 text-orbit-accent hover:bg-orbit-accent/15 transition-colors"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            Setting up
          </Link>
        ) : (
          // Wrapping span keeps the tooltip visible even when the button is disabled.
          <span title={blockReason ?? undefined} className="inline-flex">
            <Button
              size="sm"
              disabled={!activeProjectId || !!blockReason || starting}
              onClick={startRun}
              className="h-7 px-3 text-xs bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5 rounded-md shadow-[0_0_12px_hsl(var(--orbit-accent)/0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {starting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {starting ? "Starting" : "Run"}
            </Button>
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full ring-1 ring-white/10 hover:ring-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-orbit-accent/50">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={26}
                  height={26}
                  className="rounded-full"
                />
              ) : (
                <div className="h-[26px] w-[26px] rounded-full bg-white/[0.08] flex items-center justify-center">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {session?.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground leading-none">
                  {session?.user?.name ?? "User"}
                </p>
                <p className="text-xs text-muted-foreground leading-none">
                  {session?.user?.email ?? ""}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer gap-2">
              <Link href="/dashboard/profile">
                <User className="h-4 w-4" />
                Profile Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer gap-2">
              <Link href="/dashboard/settings">
                <Settings className="h-4 w-4" />
                Workspace Settings
              </Link>
            </DropdownMenuItem>
            {session?.userRole === "super_admin" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <Link href="/admin/dashboard">
                    <Shield className="h-4 w-4" />
                    Admin Dashboard
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {runError && (
        <div
          role="alert"
          className="absolute right-6 top-full mt-2 z-50 w-[320px] rounded-lg border border-orbit-fail/40 bg-orbit-fail/[0.08] backdrop-blur px-3 py-2.5 shadow-lg"
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
