"use client";

import {
  Building2,
  Users,
  FolderKanban,
  Play,
  Activity,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { StatsCard } from "@/components/admin/stats-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RecentRun {
  id: string;
  status: string;
  projectName: string;
  triggeredBy: string;
  totalTests: number;
  passed: number;
  failed: number;
  createdAt: string;
}

interface AdminDashboardClientProps {
  stats: {
    totalWorkspaces: number;
    totalUsers: number;
    totalProjects: number;
    totalRuns: number;
    activeRuns: number;
    recentFailedRuns: number;
    errorRate: number;
  };
  recentRuns: RecentRun[];
}

const statusColors: Record<string, string> = {
  completed: "bg-tm-pass/15 text-tm-pass border-tm-pass/20",
  failed: "bg-tm-fail/15 text-tm-fail border-tm-fail/20",
  executing: "bg-tm-info/15 text-tm-info border-tm-info/20",
  queued: "bg-tm-warn/15 text-tm-warn border-tm-warn/20",
  planning: "bg-tm-t2/15 text-tm-t2 border-tm-t2/20",
  indexing: "bg-tm-info/15 text-tm-info border-tm-info/20",
  reporting: "bg-tm-t2/15 text-tm-t2 border-tm-t2/20",
  cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/20",
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminDashboardClient({ stats, recentRuns }: AdminDashboardClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          System-wide metrics and activity
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Workspaces"
          value={stats.totalWorkspaces.toLocaleString()}
          icon={Building2}
          variant="accent"
        />
        <StatsCard
          title="Total Users"
          value={stats.totalUsers.toLocaleString()}
          icon={Users}
          variant="accent"
        />
        <StatsCard
          title="Total Projects"
          value={stats.totalProjects.toLocaleString()}
          icon={FolderKanban}
        />
        <StatsCard
          title="Total Runs"
          value={stats.totalRuns.toLocaleString()}
          icon={Play}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatsCard
          title="Active Runs"
          value={stats.activeRuns}
          subtitle="Currently executing"
          icon={Activity}
          variant={stats.activeRuns > 0 ? "accent" : "default"}
        />
        <StatsCard
          title="Failed (24h)"
          value={stats.recentFailedRuns}
          subtitle="Runs failed in last 24 hours"
          icon={AlertTriangle}
          variant={stats.recentFailedRuns > 5 ? "danger" : "warning"}
        />
        <StatsCard
          title="Error Rate"
          value={`${stats.errorRate}%`}
          subtitle="Based on last 100 runs"
          icon={TrendingUp}
          variant={stats.errorRate > 20 ? "danger" : "default"}
        />
      </div>

      {/* Recent activity */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent Activity
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
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Triggered By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Tests
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Results
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        "text-[10px] font-medium border",
                        statusColors[run.status] ?? statusColors.cancelled
                      )}
                    >
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{run.projectName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.triggeredBy}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.totalTests}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      {run.passed > 0 && (
                        <span className="text-tm-pass">{run.passed} passed</span>
                      )}
                      {run.failed > 0 && (
                        <span className="text-tm-fail">{run.failed} failed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {formatTimeAgo(run.createdAt)}
                  </td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No recent runs
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
