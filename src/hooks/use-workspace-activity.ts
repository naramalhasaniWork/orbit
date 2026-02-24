"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import type { ActiveOperation } from "@/lib/dashboard/active-operations";
import { fetcher } from "@/lib/swr";

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
 * Uses SWR for deduplication and smart polling.
 * Lives in the layout so it persists across page navigation.
 */
export function useWorkspaceActivity({
  initialOperations = [],
  pollInterval = DEFAULT_POLL_INTERVAL,
}: UseWorkspaceActivityOptions = {}): UseWorkspaceActivityReturn {
  const [recentlyCompleted, setRecentlyCompleted] = useState<CompletedOperation[]>([]);
  const prevOpsRef = useRef<Map<string, ActiveOperation>>(new Map());

  // Seed prevOpsRef with initial operations on first render
  useEffect(() => {
    if (initialOperations.length > 0 && prevOpsRef.current.size === 0) {
      const map = new Map<string, ActiveOperation>();
      for (const op of initialOperations) map.set(op.id, op);
      prevOpsRef.current = map;
    }
  }, [initialOperations]);

  const { data } = useSWR<ActiveOperation[]>(
    "/api/workspace/activity",
    fetcher,
    {
      refreshInterval: pollInterval,
      revalidateOnFocus: false,
      dedupingInterval: 3000,
      fallbackData: initialOperations,
      onSuccess: (newOps) => {
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

        // Update prevOpsRef for next comparison
        const map = new Map<string, ActiveOperation>();
        for (const op of newOps) map.set(op.id, op);
        prevOpsRef.current = map;
      },
    }
  );

  const operations = data ?? initialOperations;

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
