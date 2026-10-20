"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/admin/stats-card";
import { cn } from "@/lib/utils";
import {
  Users,
  FolderKanban,
  Play,
  CreditCard,
  ArrowLeft,
} from "lucide-react";
import { TIER_DISPLAY_NAMES, type WorkspaceTier } from "@/lib/auth/tier-limits";

interface Member {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    platformRole: string;
  };
}

interface Project {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  status: string;
  healthStatus: string;
  runCount: number;
  testCaseCount: number;
  lastRunAt: string | null;
}

interface RecentRun {
  id: string;
  status: string;
  projectName: string;
  totalTests: number;
  passed: number;
  failed: number;
  createdAt: string;
}

interface WorkspaceDetailClientProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    tier: WorkspaceTier;
    creditBalance: number;
    monthlyCredits: number;
    createdAt: string;
  };
  members: Member[];
  projects: Project[];
  recentRuns: RecentRun[];
  usageStats: {
    totalRuns: number;
    totalCreditsConsumed: number;
  };
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
  executing: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  queued: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  archived: "bg-gray-500/15 text-gray-400 border-gray-500/20",
};

const healthColors: Record<string, string> = {
  healthy: "text-emerald-400",
  degraded: "text-amber-400",
  failing: "text-red-400",
};

export function WorkspaceDetailClient({
  workspace,
  members,
  projects,
  recentRuns,
  usageStats,
}: WorkspaceDetailClientProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/admin/workspaces"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Back to workspaces
          </Link>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {workspace.slug}
            </span>
            <Badge className="text-[10px] border bg-muted/50 text-muted-foreground border-border">
              {TIER_DISPLAY_NAMES[workspace.tier]}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Members"
          value={members.length}
          icon={Users}
        />
        <StatsCard
          title="Projects"
          value={projects.length}
          icon={FolderKanban}
        />
        <StatsCard
          title="Total Runs"
          value={usageStats.totalRuns}
          icon={Play}
        />
        <StatsCard
          title="Credits Used"
          value={usageStats.totalCreditsConsumed.toLocaleString()}
          subtitle={`${workspace.creditBalance.toLocaleString()} remaining`}
          icon={CreditCard}
        />
      </div>

      {/* Members */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Workspace Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Platform Role
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/50 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">
                        {m.user.name ?? "Unnamed"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.user.email}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="text-[10px] border capitalize bg-muted/50 text-muted-foreground border-border">
                      {m.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        "text-[10px] border capitalize",
                        m.user.platformRole === "super_admin"
                          ? "bg-red-500/15 text-red-400 border-red-500/20"
                          : "bg-muted/50 text-muted-foreground border-border"
                      )}
                    >
                      {m.user.platformRole}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Projects */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Project
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Framework
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  Tests
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  Runs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Health
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border/50 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {p.framework ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {p.testCaseCount}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {p.runCount}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "text-xs font-medium capitalize",
                        healthColors[p.healthStatus] ?? "text-muted-foreground"
                      )}
                    >
                      {p.healthStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        "text-[10px] font-medium border capitalize",
                        statusColors[p.status] ?? statusColors.archived
                      )}
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No projects
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent Runs
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Project
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  Tests
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Results
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/50 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        "text-[10px] font-medium border",
                        statusColors[r.status] ?? statusColors.archived
                      )}
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{r.projectName}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {r.totalTests}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      {r.passed > 0 && (
                        <span className="text-emerald-400">
                          {r.passed} passed
                        </span>
                      )}
                      {r.failed > 0 && (
                        <span className="text-red-400">
                          {r.failed} failed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No runs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
