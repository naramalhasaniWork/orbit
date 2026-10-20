"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIndexingStream } from "@/hooks/use-indexing-stream";
import { formatDistanceToNow } from "date-fns";

interface IndexingStatusProps {
  projectId: string;
  lastIndexedAt: string | null;
  nodeCount: number;
  edgeCount: number;
  isIndexing: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  clone: "Cloning repository",
  framework: "Detecting framework",
  ast: "Parsing AST",
  routes: "Extracting routes",
  components: "Mapping components",
  embeddings: "Generating embeddings",
  complete: "Complete",
  error: "Error",
};

export function IndexingStatus({
  projectId,
  lastIndexedAt,
  nodeCount: initialNodeCount,
  edgeCount: initialEdgeCount,
  isIndexing: initialIsIndexing,
}: IndexingStatusProps) {
  const router = useRouter();
  const [isTriggering, setIsTriggering] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(initialIsIndexing);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const handleComplete = useCallback(() => {
    // Refresh server data after indexing completes
    setTimeout(() => {
      setStreamEnabled(false);
      router.refresh();
    }, 1500);
  }, [router]);

  const {
    status: streamStatus,
    phase,
    progress,
    message,
    nodesFound: liveNodeCount,
    edgesFound: liveEdgeCount,
    error: indexingError,
    connected,
  } = useIndexingStream({
    projectId,
    enabled: streamEnabled,
    onComplete: handleComplete,
  });

  // Auto-enable stream if server says indexing is in progress
  useEffect(() => {
    if (initialIsIndexing && !streamEnabled) {
      setStreamEnabled(true);
    }
  }, [initialIsIndexing, streamEnabled]);

  const triggerReindex = useCallback(async () => {
    setIsTriggering(true);
    setTriggerError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setStreamEnabled(true);
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setTriggerError(json.error?.message ?? `Re-index failed (${res.status})`);
      }
    } catch {
      setTriggerError("Re-index failed. Check your connection and try again.");
    } finally {
      setIsTriggering(false);
    }
  }, [projectId]);

  const isActive = streamEnabled && (streamStatus === "indexing" || streamStatus === "connecting");
  const isFailed = streamStatus === "error" || (indexingError && !isActive) || !!triggerError;
  const isComplete = streamStatus === "complete";
  const nodeCount = isActive || isComplete ? liveNodeCount || initialNodeCount : initialNodeCount;
  const edgeCount = isActive || isComplete ? liveEdgeCount || initialEdgeCount : initialEdgeCount;

  return (
    <section aria-label="System index" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="tm-label text-tm-t3">System index</h3>
        <ReindexButton
          isActive={isActive}
          isTriggering={isTriggering}
          onReindex={triggerReindex}
        />
      </div>

      {/* Active indexing state */}
      {isActive && (
        <ActiveIndexingView
          phase={phase}
          progress={progress}
          message={message}
          liveNodeCount={liveNodeCount}
          connected={connected}
        />
      )}

      {/* Error state */}
      {isFailed && !isActive && (
        <ErrorView
          error={triggerError ?? indexingError}
          onRetry={triggerReindex}
          isTriggering={isTriggering}
        />
      )}

      {/* Completed / idle state */}
      {!isActive && !isFailed && (
        <CompletedView
          lastIndexedAt={lastIndexedAt}
          nodeCount={nodeCount}
          edgeCount={edgeCount}
          justCompleted={isComplete}
        />
      )}
    </section>
  );
}

// ---- Subcomponents ----

function ReindexButton({
  isActive,
  isTriggering,
  onReindex,
}: {
  isActive: boolean;
  isTriggering: boolean;
  onReindex: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs gap-1.5"
      onClick={onReindex}
      disabled={isActive || isTriggering}
    >
      <RefreshCw aria-hidden="true" className="h-3 w-3" />
      {isActive ? "Indexing..." : isTriggering ? "Starting..." : "Re-index"}
    </Button>
  );
}

function ActiveIndexingView({
  phase,
  progress,
  message,
  liveNodeCount,
  connected,
}: {
  phase: string | null;
  progress: number;
  message: string | null;
  liveNodeCount: number;
  connected: boolean;
}) {
  const phaseLabel = phase ? PHASE_LABELS[phase] ?? phase : "Starting...";
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Pending />
        <span className="tm-label text-foreground">{phaseLabel}</span>
        {!connected && (
          <span className="tm-label text-tm-t3">Reconnecting</span>
        )}
      </div>

      {/* Progress bar */}
      <div aria-hidden="true" className="h-0.5 overflow-hidden bg-tm-line">
        <div
          className="h-full origin-left bg-foreground transition-transform duration-layout"
          style={{ transform: `scaleX(${clampedProgress / 100})` }}
        />
      </div>

      <div className="flex items-center justify-between text-[12px] text-tm-t2">
        <span>{message ?? "Processing"}</span>
        <div className="flex items-center gap-3">
          {liveNodeCount > 0 && (
            <span className="tabular-nums">{liveNodeCount} nodes</span>
          )}
          <span className="tm-num">{Math.round(clampedProgress)}%</span>
        </div>
      </div>
    </div>
  );
}

function ErrorView({
  error,
  onRetry,
  isTriggering,
}: {
  error: string | null;
  onRetry: () => void;
  isTriggering: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-orbit-fail">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{error ?? "Indexing failed"}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={onRetry}
        disabled={isTriggering}
      >
        <RefreshCw aria-hidden="true" className="h-3 w-3" />
        Retry
      </Button>
    </div>
  );
}

function CompletedView({
  lastIndexedAt,
  nodeCount,
  edgeCount,
  justCompleted,
}: {
  lastIndexedAt: string | null;
  nodeCount: number;
  edgeCount: number;
  justCompleted: boolean;
}) {
  const hasBeenIndexed = !!lastIndexedAt || nodeCount > 0;

  if (!hasBeenIndexed) {
    return (
      <p className="text-[13px] text-tm-t2">Not indexed yet. Re-index to map the repository.</p>
    );
  }

  return (
    <p className="tm-label flex flex-wrap items-center gap-x-2 text-tm-t2">
      <span className={justCompleted ? "text-tm-pass" : undefined}>
        <span aria-hidden="true">✓ </span>
        {justCompleted ? "Indexing complete" : "Indexed"}
      </span>
      {lastIndexedAt && <span className="normal-case">· {formatDistanceToNow(new Date(lastIndexedAt), { addSuffix: true })}</span>}
      <span className="tm-num">· {nodeCount} nodes · {edgeCount} edges</span>
    </p>
  );
}
