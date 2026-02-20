"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRunEvents } from "@/hooks/use-run-events";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/shared/status-dot";
import { Eye } from "lucide-react";
import Link from "next/link";

interface ActiveRun {
  id: string;
  status: string;
  trigger: string;
  mode: string;
  totalTests: number;
  passed: number;
  failed: number;
  projectId: string;
}

interface ActiveRunBarProps {
  initialRun: ActiveRun | null;
  projectId: string;
}

const triggerLabels: Record<string, string> = {
  push: "Push",
  pr: "Pull Request",
  scheduled: "Scheduled",
  manual: "Manual",
  linear: "Linear",
  api: "API",
};

export function ActiveRunBar({ initialRun, projectId }: ActiveRunBarProps) {
  const [run, setRun] = useState(initialRun);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  const handleComplete = useCallback(() => {
    setTimeout(() => {
      setDismissed(true);
      router.refresh();
    }, 3000);
  }, [router]);

  const { progress } = useRunEvents({
    projectId,
    runId: run?.id ?? "",
    enabled: !!run && !dismissed,
    onComplete: handleComplete,
  });

  if (!run || dismissed) return null;

  const completed = progress
    ? progress.completed
    : run.passed + run.failed;
  const total = progress ? progress.totalTests : run.totalTests;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const currentTest = progress?.currentTest;
  const passed = progress?.passed ?? run.passed;
  const failed = progress?.failed ?? run.failed;
  const isTerminal = progress?.status === "completed" || progress?.status === "failed";

  return (
    <div className="flex items-center gap-4 rounded-xl bg-orbit-accent/[0.06] px-4 py-3">
      <StatusDot
        status={isTerminal ? (failed > 0 ? "fail" : "pass") : "running"}
        pulse={!isTerminal}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">
            {triggerLabels[run.trigger] ?? run.trigger} run
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {run.mode}
          </span>
          {currentTest && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {currentTest}
            </span>
          )}
          {isTerminal && (
            <span className="text-xs font-medium text-orbit-pass">
              {progress?.status === "completed" ? "Complete" : "Failed"}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isTerminal && failed > 0 ? "bg-orbit-fail" : "bg-orbit-accent"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground shrink-0">
            {completed}/{total} ({pct}%)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs tabular-nums shrink-0">
        {passed > 0 && (
          <span className="text-orbit-pass">{passed} pass</span>
        )}
        {failed > 0 && (
          <span className="text-orbit-fail">{failed} fail</span>
        )}
      </div>

      <Link href={`/dashboard/runs/${run.id}`}>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-transparent bg-orbit-accent/15 text-orbit-accent hover:bg-orbit-accent/20"
        >
          <Eye className="h-3.5 w-3.5" />
          Watch Live
        </Button>
      </Link>
    </div>
  );
}
