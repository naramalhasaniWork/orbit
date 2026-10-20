"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Database,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    <div className="rounded-xl surface-1 border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[13px] font-medium text-foreground">System Index</h3>
        </div>
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
    </div>
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
      <RefreshCw className={cn("h-3 w-3")} />
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
        <span className="text-sm text-foreground">{phaseLabel}</span>
        {!connected && (
          <span className="text-[10px] text-orbit-flaky">reconnecting...</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-orbit-accent rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{message ?? "Processing..."}</span>
        <div className="flex items-center gap-3">
          {liveNodeCount > 0 && (
            <span className="tabular-nums">{liveNodeCount} nodes</span>
          )}
          <span className="tabular-nums">{Math.round(clampedProgress)}%</span>
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
        <RefreshCw className={cn("h-3 w-3")} />
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <GitBranch className="h-4 w-4" />
        <span>Not yet indexed. Click Re-index to start.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className={cn(
          "h-4 w-4 shrink-0",
          justCompleted ? "text-orbit-pass" : "text-muted-foreground"
        )} />
        <span className={justCompleted ? "text-orbit-pass" : "text-muted-foreground"}>
          {justCompleted ? "Indexing complete" : "Indexed"}
        </span>
        {lastIndexedAt && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(lastIndexedAt), { addSuffix: true })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="tabular-nums">{nodeCount} nodes</span>
        <span className="tabular-nums">{edgeCount} edges</span>
      </div>
    </div>
  );
}
