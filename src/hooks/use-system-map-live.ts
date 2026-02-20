"use client";

import { useState, useCallback, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";
import type { MapNode } from "@/components/dashboard/map-types";
import type { IndexingNodeDiscoveredEvent } from "@/lib/websocket/channels";

interface UseSystemMapLiveOptions {
  projectId: string;
  enabled?: boolean;
  initialNodes?: MapNode[];
}

/**
 * Hook that subscribes to indexing events and builds a live System Map
 * as nodes are discovered. During onboarding, this powers the real-time
 * visualization where nodes appear and connect with animations.
 */
export function useSystemMapLive({
  projectId,
  enabled = true,
  initialNodes = [],
}: UseSystemMapLiveOptions) {
  const [nodes, setNodes] = useState<MapNode[]>(initialNodes);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const nodeSetRef = useRef(new Set(initialNodes.map((n) => n.id)));

  const handleEvent = useCallback((event: { type: string; data: unknown }) => {
    const payload = event.data as Record<string, unknown>;

    switch (event.type) {
      case "indexing:started": {
        setIsIndexing(true);
        setIsComplete(false);
        break;
      }

      case "indexing:node_discovered": {
        const data = payload as unknown as IndexingNodeDiscoveredEvent;
        if (nodeSetRef.current.has(data.nodeId)) return;
        nodeSetRef.current.add(data.nodeId);

        const newNode: MapNode = {
          id: data.nodeId,
          type: data.nodeType as MapNode["type"],
          name: data.nodeName,
          filePath: data.filePath,
          metadata: null,
          testStatus: "untested",
        };

        setNodes((prev) => [...prev, newNode]);
        break;
      }

      case "indexing:completed": {
        setIsIndexing(false);
        setIsComplete(true);
        break;
      }

      case "indexing:failed": {
        setIsIndexing(false);
        break;
      }
    }
  }, []);

  const url = `/api/projects/${projectId}/sync/progress`;

  const { connected } = useSSE({
    url,
    enabled: enabled && !!projectId,
    onEvent: handleEvent,
  });

  const reset = useCallback(() => {
    setNodes([]);
    nodeSetRef.current.clear();
    setIsIndexing(false);
    setIsComplete(false);
  }, []);

  return {
    nodes,
    isIndexing,
    isComplete,
    connected,
    nodeCount: nodes.length,
    reset,
  };
}
