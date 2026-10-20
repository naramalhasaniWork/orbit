"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRunEvents } from "@/hooks/use-run-events";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/telemetry/status";
import { toneForRun } from "@/lib/status-tone";
import { GroundTrack } from "@/components/telemetry/ground-track";
import Link from "next/link";

interface ActiveRun {
  id: string;
  status: string;
  trigger: string;
  mode: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
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
    : run.passed + run.failed + run.flaky;
  const total = progress ? progress.totalTests : run.totalTests;
  const currentTest = progress?.currentTest;
  const passed = progress?.passed ?? run.passed;
  const failed = progress?.failed ?? run.failed;
  const isTerminal = progress?.status === "completed" || progress?.status === "failed";

  // The terminal status decides: a "failed" run is a failure even when the event carried no counts.
  const tone = isTerminal ? toneForRun(progress?.status ?? "completed", { failed }) : "live";
  const ticks = [
    ...Array.from({ length: passed }, () => ({ tone: "pass" as const })),
    ...Array.from({ length: failed }, () => ({ tone: "fail" as const })),
    ...(isTerminal ? [] : [{ tone: "live" as const }]),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="tm-label flex flex-wrap items-center gap-x-2 text-tm-t2">
          <Status tone={tone} label={isTerminal ? (tone === "fail" ? "Failed" : "Passed") : "Live"} mono />
          <span>· {triggerLabels[run.trigger] ?? run.trigger} · {run.mode}</span>
          {total > 0 && <span className="tm-num">· {String(completed).padStart(2, "0")}/{String(total).padStart(2, "0")}</span>}
        </p>
        {currentTest && <p className="truncate text-[13px] text-foreground">{currentTest}</p>}
        {total > 0 && <GroundTrack ticks={ticks} slots={total} noun="tests" />}
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link href={`/dashboard/runs/${run.id}`}>Watch live</Link>
      </Button>
    </div>
  );
}
