"use client";

import useSWR from "swr";
import { Status } from "@/components/telemetry/status";
import { resolveBadgeStatus, type HealthResponse } from "@/lib/health/badge-status";

interface HealthBadgeProps {
  /** The active project's test health, if there is an active project. */
  projectStatus?: string;
}

const TONE = { healthy: "pass", degraded: "flaky", failing: "fail" } as const;

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
  return (
    <span role="status" title={status.detail}>
      <Status tone={TONE[status.tone]} label={status.label} mono />
    </span>
  );
}
