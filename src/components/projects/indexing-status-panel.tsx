"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IndexingStatus } from "@/components/project/indexing-status";

interface IndexingStatusPanelProps {
  projectId: string;
  lastIndexedAt: Date | null;
  nodeCount: number;
  edgeCount: number;
  onReindexComplete?: () => void;
}

/**
 * Wrapper for the IndexingStatus component used in the project detail view.
 * Fetches initial indexing status from the API and adapts Date-based props
 * to the string format expected by IndexingStatus.
 */
export function IndexingStatusPanel({
  projectId,
  lastIndexedAt,
  nodeCount,
  edgeCount,
  onReindexComplete,
}: IndexingStatusPanelProps) {
  const router = useRouter();
  const [isIndexing, setIsIndexing] = useState(false);

  // Check if indexing is in progress on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`/api/projects/${projectId}/sync`);
        if (res.ok) {
          const data = await res.json();
          if (data.data?.isIndexing) {
            setIsIndexing(true);
          }
        }
      } catch {
        // Ignore — defaults to not indexing
      }
    }
    checkStatus();
  }, [projectId]);

  return (
    <IndexingStatus
      projectId={projectId}
      lastIndexedAt={lastIndexedAt?.toISOString() ?? null}
      nodeCount={nodeCount}
      edgeCount={edgeCount}
      isIndexing={isIndexing}
    />
  );
}
