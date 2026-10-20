"use client";

import { useState, useCallback, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";
import type {
  RunStartedEvent,
  RunCompletedEvent,
} from "@/lib/websocket/channels";

export interface ProjectRunUpdate {
  runId: string;
  status: string;
  mode: string;
  trigger: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  durationMs: number | null;
  projectId: string;
}

interface UseProjectEventsOptions {
  projectId: string;
  enabled?: boolean;
  onRunStarted?: (run: ProjectRunUpdate) => void;
  onRunCompleted?: (run: ProjectRunUpdate) => void;
}

/**
 * Subscribes to project-level events via SSE.
 * Receives run:started and run:completed events for the entire project,
 * allowing dashboard components (ActiveRunBar, home stats)
 * to update in real-time without polling.
 */
export function useProjectEvents({
  projectId,
  enabled = true,
  onRunStarted,
  onRunCompleted,
}: UseProjectEventsOptions) {
  const [activeRun, setActiveRun] = useState<ProjectRunUpdate | null>(null);
  const [lastCompletedRun, setLastCompletedRun] = useState<ProjectRunUpdate | null>(null);

  const onRunStartedRef = useRef(onRunStarted);
  onRunStartedRef.current = onRunStarted;
  const onRunCompletedRef = useRef(onRunCompleted);
  onRunCompletedRef.current = onRunCompleted;

  const handleEvent = useCallback((event: { type: string; data: unknown }) => {
    const payload = event.data as Record<string, unknown>;

    switch (event.type) {
      case "run:started": {
        const data = payload as unknown as RunStartedEvent;
        const run: ProjectRunUpdate = {
          runId: data.runId,
          status: "executing",
          mode: data.mode,
          trigger: data.trigger,
          totalTests: data.totalTests,
          passed: 0,
          failed: 0,
          flaky: 0,
          durationMs: null,
          projectId: data.projectId,
        };
        setActiveRun(run);
        onRunStartedRef.current?.(run);
        break;
      }

      case "run:completed": {
        const data = payload as unknown as RunCompletedEvent;
        const run: ProjectRunUpdate = {
          runId: data.runId,
          status: data.status,
          mode: "",
          trigger: "",
          totalTests: data.totalTests,
          passed: data.passed,
          failed: data.failed,
          flaky: data.flaky,
          durationMs: data.durationMs,
          projectId: data.projectId,
        };
        setActiveRun(null);
        setLastCompletedRun(run);
        onRunCompletedRef.current?.(run);
        break;
      }
    }
  }, []);

  const url = `/api/projects/${projectId}/events`;

  const { connected, error } = useSSE({
    url,
    enabled: enabled && !!projectId,
    onEvent: handleEvent,
  });

  return {
    activeRun,
    lastCompletedRun,
    connected,
    error,
  };
}
