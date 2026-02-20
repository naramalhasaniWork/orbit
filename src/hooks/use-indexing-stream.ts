"use client";

import { useState, useCallback, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";
import type {
  IndexingPhase,
  IndexingNodeDiscoveredEvent,
} from "@/lib/websocket/channels";

export interface IndexingState {
  status: "idle" | "connecting" | "indexing" | "complete" | "error";
  phase: IndexingPhase | null;
  progress: number;
  message: string | null;
  nodesFound: number;
  edgesFound: number;
  durationMs: number | null;
  error: string | null;
  discoveredNodes: DiscoveredNode[];
}

export interface DiscoveredNode {
  id: string;
  type: string;
  name: string;
  filePath: string | null;
  timestamp: number;
}

interface UseIndexingStreamOptions {
  projectId: string;
  enabled?: boolean;
  onNodeDiscovered?: (node: IndexingNodeDiscoveredEvent) => void;
  onComplete?: (state: IndexingState) => void;
  onError?: (error: string) => void;
}

const MAX_DISCOVERED_NODES = 200;

export function useIndexingStream({
  projectId,
  enabled = true,
  onNodeDiscovered,
  onComplete,
  onError,
}: UseIndexingStreamOptions) {
  const [state, setState] = useState<IndexingState>({
    status: "idle",
    phase: null,
    progress: 0,
    message: null,
    nodesFound: 0,
    edgesFound: 0,
    durationMs: null,
    error: null,
    discoveredNodes: [],
  });

  const onNodeDiscoveredRef = useRef(onNodeDiscovered);
  onNodeDiscoveredRef.current = onNodeDiscovered;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const handleEvent = useCallback((event: { type: string; data: unknown }) => {
    const payload = event.data as Record<string, unknown>;

    switch (event.type) {
      case "connected": {
        setState((prev) => ({
          ...prev,
          status: prev.status === "idle" ? "connecting" : prev.status,
        }));
        break;
      }

      case "indexing:started": {
        setState((prev) => ({
          ...prev,
          status: "indexing",
          phase: "clone",
          message: "Starting indexing...",
          progress: 0,
        }));
        break;
      }

      case "indexing:phase": {
        setState((prev) => ({
          ...prev,
          status: "indexing",
          phase: (payload.phase as IndexingPhase) ?? prev.phase,
          message: (payload.message as string) ?? prev.message,
          progress: (payload.progress as number) ?? prev.progress,
        }));
        break;
      }

      case "indexing:node_discovered": {
        const node = payload as unknown as IndexingNodeDiscoveredEvent;
        const discovered: DiscoveredNode = {
          id: node.nodeId,
          type: node.nodeType,
          name: node.nodeName,
          filePath: node.filePath,
          timestamp: Date.now(),
        };

        setState((prev) => ({
          ...prev,
          nodesFound: prev.nodesFound + 1,
          discoveredNodes: [
            discovered,
            ...prev.discoveredNodes.slice(0, MAX_DISCOVERED_NODES - 1),
          ],
        }));

        onNodeDiscoveredRef.current?.(node);
        break;
      }

      case "indexing:progress": {
        setState((prev) => ({
          ...prev,
          status: "indexing",
          phase: (payload.phase as IndexingPhase) ?? prev.phase,
          message: (payload.message as string) ?? prev.message,
          nodesFound: (payload.nodesFound as number) ?? prev.nodesFound,
          progress: (payload.progress as number) ?? prev.progress,
        }));
        break;
      }

      case "indexing:completed": {
        const final: IndexingState = {
          status: "complete",
          phase: "complete",
          progress: 100,
          message: "Indexing complete",
          nodesFound: (payload.nodesFound as number) ?? 0,
          edgesFound: (payload.edgesFound as number) ?? 0,
          durationMs: (payload.durationMs as number) ?? null,
          error: null,
          discoveredNodes: [],
        };
        setState((prev) => ({ ...final, discoveredNodes: prev.discoveredNodes }));
        onCompleteRef.current?.(final);
        break;
      }

      case "indexing:failed": {
        const errorMsg = (payload.error as string) ?? "Indexing failed";
        setState((prev) => ({
          ...prev,
          status: "error",
          phase: (payload.phase as IndexingPhase) ?? prev.phase,
          error: errorMsg,
          progress: -1,
        }));
        onErrorRef.current?.(errorMsg);
        break;
      }
    }
  }, []);

  const url = `/api/projects/${projectId}/sync/progress`;

  const { connected, error: sseError } = useSSE({
    url,
    enabled: enabled && !!projectId,
    onEvent: handleEvent,
  });

  return {
    ...state,
    connected,
    sseError,
  };
}
