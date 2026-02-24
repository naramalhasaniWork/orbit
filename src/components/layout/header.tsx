"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { HealthBadge } from "./health-badge";
import { Button } from "@/components/ui/button";
import { Play, ChevronDown, User, Settings, Shield, LogOut } from "lucide-react";
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

  function handleSelectProject(projectId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectId);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <header className="flex items-center justify-between h-12 px-6 surface-1 border-b border-border shrink-0">
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
        />

        <Button
          size="sm"
          disabled={!activeProjectId}
          onClick={async () => {
            if (!activeProjectId) return;
            try {
              await fetch(`/api/projects/${activeProjectId}/runs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trigger: "manual" }),
              });
              router.push(`/dashboard/runs?project=${activeProjectId}`);
            } catch (err) {
              console.error("Failed to trigger run:", err);
            }
          }}
          className="h-7 px-3 text-xs bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5 rounded-md shadow-[0_0_12px_hsl(var(--orbit-accent)/0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="h-3 w-3" />
          Run
        </Button>

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
    </header>
  );
}
