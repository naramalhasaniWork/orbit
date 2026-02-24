"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ActiveOperation } from "@/lib/dashboard/active-operations";

interface UseWorkspaceActivityOptions {
  /** Initial operations from server render */
  initialOperations?: ActiveOperation[];
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
}

interface UseWorkspaceActivityReturn {
  operations: ActiveOperation[];
  /** True while any operation is active */
  hasActivity: boolean;
  /** Recently completed operations (shown briefly before dismissing) */
  recentlyCompleted: CompletedOperation[];
}

interface CompletedOperation {
  id: string;
  projectName: string;
  label: string;
  completedAt: number;
}

const DEFAULT_POLL_INTERVAL = 5000;
const COMPLETED_DISPLAY_DURATION = 4000;

/**
 * Polls the workspace activity API to track active background operations.
 * Lives in the layout so it persists across page navigation.
 */
export function useWorkspaceActivity({
  initialOperations = [],
  pollInterval = DEFAULT_POLL_INTERVAL,
}: UseWorkspaceActivityOptions = {}): UseWorkspaceActivityReturn {
  const [operations, setOperations] = useState<ActiveOperation[]>(initialOperations);
  const [recentlyCompleted, setRecentlyCompleted] = useState<CompletedOperation[]>([]);
  const prevOpsRef = useRef<Map<string, ActiveOperation>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Track previous operations to detect completions
  useEffect(() => {
    const map = new Map<string, ActiveOperation>();
    for (const op of operations) map.set(op.id, op);
    prevOpsRef.current = map;
  }, [operations]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/activity");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !mountedRef.current) return;

      const newOps: ActiveOperation[] = json.data;

      // Detect operations that disappeared (completed/failed)
      const newIds = new Set(newOps.map((o) => o.id));
      const completed: CompletedOperation[] = [];

      prevOpsRef.current.forEach((prev, id) => {
        if (!newIds.has(id)) {
          completed.push({
            id,
            projectName: prev.projectName,
            label: prev.label.replace("ing", "ed").replace("Queu", "Process"),
            completedAt: Date.now(),
          });
        }
      });

      if (completed.length > 0) {
        setRecentlyCompleted((prev) => [...prev, ...completed]);
      }

      setOperations(newOps);
    } catch {
      // Network error — keep existing state
    }
  }, []);

  // Start/stop polling based on whether there's activity
  useEffect(() => {
    mountedRef.current = true;

    // Always do an initial fetch
    fetchActivity();

    // Poll at the configured interval
    pollRef.current = setInterval(fetchActivity, pollInterval);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchActivity, pollInterval]);

  // Auto-dismiss completed operations after a delay
  useEffect(() => {
    if (recentlyCompleted.length === 0) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      setRecentlyCompleted((prev) =>
        prev.filter((c) => now - c.completedAt < COMPLETED_DISPLAY_DURATION)
      );
    }, COMPLETED_DISPLAY_DURATION);

    return () => clearTimeout(timer);
  }, [recentlyCompleted]);

  return {
    operations,
    hasActivity: operations.length > 0,
    recentlyCompleted,
  };
}
