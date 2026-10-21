"use client";

import {
  Building2,
  Users,
  Play,
  CreditCard,
  TrendingUp,
} from "lucide-react";
import { StatsCard } from "@/components/admin/stats-card";
import { cn } from "@/lib/utils";

interface DailyRunStat {
  date: string;
  runs: number;
  passed: number;
  failed: number;
  credits: number;
}

interface GrowthEntry {
  date: string;
  count: number;
}

interface AnalyticsClientProps {
  overview: {
    totalWorkspaces: number;
    totalUsers: number;
    totalRuns: number;
    runsLast30Days: number;
    creditsLast30Days: number;
  };
  dailyRunStats: DailyRunStat[];
  userGrowth: GrowthEntry[];
  workspaceGrowth: GrowthEntry[];
}

function MiniBarChart({
  data,
  maxValue,
  colorClass,
}: {
  data: number[];
  maxValue: number;
  colorClass: string;
}) {
  const max = maxValue || Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[2px] h-16">
      {data.map((val, i) => (
        <div
          key={i}
          className={cn("rounded-sm min-h-[2px] flex-1", colorClass)}
          style={{ height: `${(val / max) * 100}%` }}
          title={`${val}`}
        />
      ))}
    </div>
  );
}

export function AnalyticsClient({
  overview,
  dailyRunStats,
  userGrowth,
  workspaceGrowth,
}: AnalyticsClientProps) {
  const runCounts = dailyRunStats.map((d) => d.runs);
  const passedCounts = dailyRunStats.map((d) => d.passed);
  const failedCounts = dailyRunStats.map((d) => d.failed);
  const creditCounts = dailyRunStats.map((d) => d.credits);
  const maxRuns = Math.max(...runCounts, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Platform Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Usage trends and growth metrics (last 30 days)
        </p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Workspaces"
          value={overview.totalWorkspaces.toLocaleString()}
          icon={Building2}
        />
        <StatsCard
          title="Users"
          value={overview.totalUsers.toLocaleString()}
          icon={Users}
        />
        <StatsCard
          title="Total Runs"
          value={overview.totalRuns.toLocaleString()}
          icon={Play}
        />
        <StatsCard
          title="Runs (30d)"
          value={overview.runsLast30Days.toLocaleString()}
          icon={TrendingUp}
          variant="accent"
        />
        <StatsCard
          title="Credits (30d)"
          value={overview.creditsLast30Days.toLocaleString()}
          icon={CreditCard}
        />
      </div>

      {/* Runs per day chart */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Runs Per Day
        </h2>
        <div className="rounded-xl border border-border bg-muted/30 p-5">
          {dailyRunStats.length > 0 ? (
            <div className="space-y-4">
              <MiniBarChart
                data={runCounts}
                maxValue={maxRuns}
                colorClass="bg-foreground/[0.06]"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{dailyRunStats[0]?.date}</span>
                <span>{dailyRunStats[dailyRunStats.length - 1]?.date}</span>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No run data for this period
            </p>
          )}
        </div>
      </div>

      {/* Pass/Fail breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Passed Tests Per Day
          </h2>
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            {passedCounts.length > 0 ? (
              <MiniBarChart
                data={passedCounts}
                maxValue={Math.max(...passedCounts, ...failedCounts, 1)}
                colorClass="bg-tm-pass/70"
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No data</p>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Failed Tests Per Day
          </h2>
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            {failedCounts.length > 0 ? (
              <MiniBarChart
                data={failedCounts}
                maxValue={Math.max(...passedCounts, ...failedCounts, 1)}
                colorClass="bg-tm-fail/70"
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Credit consumption */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Credit Consumption
        </h2>
        <div className="rounded-xl border border-border bg-muted/30 p-5">
          {creditCounts.length > 0 ? (
            <div className="space-y-4">
              <MiniBarChart
                data={creditCounts}
                maxValue={Math.max(...creditCounts, 1)}
                colorClass="bg-tm-warn/70"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{dailyRunStats[0]?.date}</span>
                <span>{dailyRunStats[dailyRunStats.length - 1]?.date}</span>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No data</p>
          )}
        </div>
      </div>

      {/* Growth charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            New Users Per Day
          </h2>
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            {userGrowth.length > 0 ? (
              <MiniBarChart
                data={userGrowth.map((d) => d.count)}
                maxValue={Math.max(...userGrowth.map((d) => d.count), 1)}
                colorClass="bg-tm-info/70"
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No data</p>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            New Workspaces Per Day
          </h2>
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            {workspaceGrowth.length > 0 ? (
              <MiniBarChart
                data={workspaceGrowth.map((d) => d.count)}
                maxValue={Math.max(...workspaceGrowth.map((d) => d.count), 1)}
                colorClass="bg-tm-t2/70"
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily breakdown table */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Daily Breakdown
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Runs
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Passed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Failed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...dailyRunStats].reverse().map((day) => (
                  <tr
                    key={day.date}
                    className="border-b border-border/50 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5 font-medium">{day.date}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {day.runs}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tm-pass">
                      {day.passed}
                    </td>
                    <td className="px-4 py-2.5 text-right text-tm-fail">
                      {day.failed}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {day.credits}
                    </td>
                  </tr>
                ))}
                {dailyRunStats.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
