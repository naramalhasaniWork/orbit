"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import { resolveBadgeStatus, type HealthResponse } from "@/lib/health/badge-status";

interface HealthBadgeProps {
  /** The active project's test health, if there is an active project. */
  projectStatus?: string;
}

const toneStyles = {
  healthy: {
    dot: "bg-orbit-pass",
    text: "text-orbit-pass",
    glow: "",
    bg: "bg-orbit-pass/[0.08]",
  },
  degraded: {
    dot: "bg-orbit-flaky",
    text: "text-orbit-flaky",
    glow: "",
    bg: "bg-orbit-flaky/[0.08]",
  },
  failing: {
    dot: "bg-orbit-fail",
    text: "text-orbit-fail",
    glow: "",
    bg: "bg-orbit-fail/[0.08]",
  },
};

// /api/health answers 503 with the same JSON body when unhealthy.
async function fetchHealth(url: string): Promise<HealthResponse> {
  const res = await fetch(url, { cache: "no-store" });
  return (await res.json()) as HealthResponse;
}

export function HealthBadge({ projectStatus }: HealthBadgeProps) {
  const { data } = useSWR("/api/health", fetchHealth, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  const status = resolveBadgeStatus(data, projectStatus);
  if (!status) return null;
  const style = toneStyles[status.tone];

  return (
    <div
      role="status"
      title={status.detail}
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
        style.bg,
        style.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot, style.glow)} />
      {status.label}
    </div>
  );
}
