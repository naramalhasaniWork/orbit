"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { useSSE } from "@/hooks/use-sse";
import type { PlanJobState } from "@/lib/websocket/channels";

interface StartOptions {
  mode?: "full" | "smoke" | "regression" | "targeted";
}

interface UsePlanGenerationOptions {
  projectId: string | null;
  /** Called once when a generation this hook is watching completes. */
  onCompleted?: (job: PlanJobState) => void;
}

const isActive = (job: PlanJobState | null | undefined) =>
  !!job && (job.status === "queued" || job.status === "running");

/**
 * Tracks the project's background plan generation: picks up a job already
 * in flight (e.g. after a reload), streams its progress over SSE, and polls
 * as a fallback when the stream is down.
 */
export function usePlanGeneration({ projectId, onCompleted }: UsePlanGenerationOptions) {
  const [job, setJob] = useState<PlanJobState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Jobs seen while queued/running; only those fire onCompleted, so a job
  // that finished before this page loaded doesn't trigger a refresh.
  const watchedRef = useRef(new Set<string>());
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const active = isActive(job);

  const { connected } = useSSE({
    url: projectId ? `/api/projects/${projectId}/plan/progress` : "",
    enabled: !!projectId && active,
    onEvent: (event) => {
      if (event.type.startsWith("plan:")) setJob(event.data as PlanJobState);
    },
  });

  // Initial load, and the fallback poll while active without a live stream.
  const { data } = useSWR<{ job: PlanJobState | null }>(
    projectId ? `/api/projects/${projectId}/plan/job` : null,
    fetcher,
    {
      refreshInterval: active && !connected ? 10_000 : 0,
      revalidateOnFocus: false,
    }
  );

  useEffect(() => {
    if (data?.job && (!job || data.job.updatedAt > job.updatedAt)) setJob(data.job);
  }, [data, job]);

  useEffect(() => {
    if (!job) return;
    if (isActive(job)) {
      watchedRef.current.add(job.jobId);
    } else if (job.status === "completed" && watchedRef.current.delete(job.jobId)) {
      onCompletedRef.current?.(job);
    }
  }, [job]);

  const start = useCallback(
    async (options: StartOptions = {}) => {
      if (!projectId || starting) return;
      setStarting(true);
      setStartError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: options.mode ?? "full" }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: { job?: PlanJobState };
          error?: { message?: string };
        };
        if (!res.ok || !json.data?.job) {
          setStartError(json.error?.message ?? `Plan generation could not start (${res.status})`);
          return;
        }
        setJob(json.data.job);
      } catch {
        setStartError("Plan generation could not start. Check your connection and try again.");
      } finally {
        setStarting(false);
      }
    },
    [projectId, starting]
  );

  return {
    job,
    active,
    starting,
    error: startError ?? (job?.status === "failed" ? job.error ?? "Plan generation failed" : null),
    start,
  };
}
