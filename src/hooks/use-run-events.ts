"use client";

import { useEffect, useState, useCallback } from "react";

interface RunProgress {
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  completed: number;
  currentTest: string | null;
  lastVerdict: string | null;
  durationMs: number | null;
}

interface UseRunEventsOptions {
  projectId: string;
  runId: string;
  enabled?: boolean;
  onComplete?: (data: RunProgress) => void;
}

export function useRunEvents({
  projectId,
  runId,
  enabled = true,
  onComplete,
}: UseRunEventsOptions) {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableOnComplete = useCallback(
    (data: RunProgress) => onComplete?.(data),
    [onComplete]
  );

  useEffect(() => {
    if (!enabled || !runId || !projectId) return;

    const url = `/api/projects/${projectId}/runs/${runId}/progress`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RunProgress;
        setProgress(data);

        const terminal = ["completed", "failed", "cancelled", "not_found", "timeout", "error"];
        if (terminal.includes(data.status)) {
          stableOnComplete(data);
          eventSource.close();
          setConnected(false);
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setError("Connection lost");
      setConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [projectId, runId, enabled, stableOnComplete]);

  return { progress, connected, error };
}
