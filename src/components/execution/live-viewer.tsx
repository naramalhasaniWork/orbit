"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Pause,
  Play,
  Download,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScreenshotStream } from "@/hooks/use-screenshot-stream";
import { useRunEvents, type TestStepProgress } from "@/hooks/use-run-events";
import { LiveStepPanel, type LiveStep } from "@/components/execution/live-step-panel";
import { ScreenshotThumbnailStrip } from "@/components/execution/screenshot-thumbnail-strip";

// ============================================================
// Types
// ============================================================

interface LiveViewerProps {
  projectId: string;
  runId: string;
  enabled?: boolean;
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function LiveExecutionViewer({
  projectId,
  runId,
  enabled = true,
  className,
}: LiveViewerProps) {
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);

  const {
    currentFrame,
    frameHistory,
    isStreaming,
    isPaused,
    pause,
    resume,
    frameCount,
  } = useScreenshotStream({ projectId, runId, enabled });

  const { steps: rawSteps } = useRunEvents({
    projectId,
    runId,
    enabled,
  });

  // Convert raw steps to LiveStep format
  const liveSteps: LiveStep[] = useMemo(
    () => rawSteps.map(toLiveStep),
    [rawSteps]
  );

  const activeStepIndex = liveSteps.length > 0
    ? liveSteps[liveSteps.length - 1].stepIndex
    : null;

  // Determine displayed frame: selected thumbnail or current live frame
  const displayedFrame = selectedFrameIndex !== null
    ? frameHistory[selectedFrameIndex] ?? currentFrame
    : currentFrame;

  const handleThumbnailSelect = useCallback((index: number) => {
    setSelectedFrameIndex(index);
  }, []);

  const handleDownload = useCallback(() => {
    if (!displayedFrame) return;
    const link = document.createElement("a");
    link.href = `data:image/jpeg;base64,${displayedFrame.imageBase64}`;
    link.download = `screenshot-${displayedFrame.runId}-step${displayedFrame.stepIndex}.jpg`;
    link.click();
  }, [displayedFrame]);

  const handlePlayPause = useCallback(() => {
    if (isPaused) {
      resume();
      setSelectedFrameIndex(null);
    } else {
      pause();
    }
  }, [isPaused, pause, resume]);

  return (
    <div className={cn("flex flex-col rounded-xl border border-white/[0.06] overflow-hidden bg-[hsl(var(--orbit-bg-deeper,222_47%_6%))]", className)}>
      {/* Main area: viewport + step panel */}
      <div className="flex flex-1 min-h-0">
        {/* Viewport (70%) */}
        <div className="flex flex-col flex-[7] min-w-0">
          {/* URL bar + LIVE badge */}
          <ViewportHeader
            pageUrl={displayedFrame?.pageUrl ?? null}
            viewport={displayedFrame?.viewport ?? null}
            isStreaming={isStreaming}
          />

          {/* Screenshot display */}
          <div className="relative flex-1 bg-black/20 min-h-[300px]">
            <AnimatePresence mode="wait">
              {displayedFrame ? (
                <motion.img
                  key={displayedFrame.timestamp}
                  src={`data:image/jpeg;base64,${displayedFrame.imageBase64}`}
                  alt="Live browser screenshot"
                  className="absolute inset-0 w-full h-full object-contain"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                />
              ) : (
                <motion.div
                  key="placeholder"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Monitor className="h-8 w-8 text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground">
                    {isStreaming ? "Waiting for screenshots..." : "Connect to start viewing"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Frame count */}
            {frameCount > 0 && (
              <div className="absolute bottom-2 right-2 text-[10px] tabular-nums text-white/50 bg-black/40 rounded px-1.5 py-0.5">
                {frameCount} frames
              </div>
            )}
          </div>

          {/* Controls bar */}
          <ControlsBar
            isPaused={isPaused}
            onPlayPause={handlePlayPause}
            onDownload={handleDownload}
            hasFrame={!!displayedFrame}
            isStreaming={isStreaming}
          />

          {/* Thumbnail strip */}
          <ScreenshotThumbnailStrip
            frames={frameHistory}
            activeIndex={selectedFrameIndex ?? (frameHistory.length - 1)}
            onSelect={handleThumbnailSelect}
          />
        </div>

        {/* Step log panel (30%) */}
        <LiveStepPanel
          steps={liveSteps}
          activeStepIndex={activeStepIndex}
          className="flex-[3] max-w-[350px]"
        />
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ViewportHeader({
  pageUrl,
  viewport,
  isStreaming,
}: {
  pageUrl: string | null;
  viewport: { width: number; height: number } | null;
  isStreaming: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-white/[0.02] shrink-0">
      {/* LIVE badge */}
      {isStreaming && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
            Live
          </span>
        </div>
      )}

      {/* URL */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {pageUrl ? (
          <>
            <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono truncate">
              {pageUrl}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No page loaded</span>
        )}
      </div>

      {/* Viewport size */}
      {viewport && (
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
          {viewport.width}x{viewport.height}
        </span>
      )}
    </div>
  );
}

function ControlsBar({
  isPaused,
  onPlayPause,
  onDownload,
  hasFrame,
  isStreaming,
}: {
  isPaused: boolean;
  onPlayPause: () => void;
  onDownload: () => void;
  hasFrame: boolean;
  isStreaming: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-white/[0.04] bg-white/[0.02] shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPlayPause}
        disabled={!isStreaming}
        title={isPaused ? "Resume" : "Pause"}
      >
        {isPaused ? (
          <Play className="h-3.5 w-3.5" />
        ) : (
          <Pause className="h-3.5 w-3.5" />
        )}
      </Button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onDownload}
        disabled={!hasFrame}
        title="Download screenshot"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function toLiveStep(step: TestStepProgress): LiveStep {
  return {
    stepIndex: step.stepIndex,
    testCaseId: step.testCaseId,
    action: step.action,
    status: step.status,
  };
}
