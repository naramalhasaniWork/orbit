"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, Download } from "lucide-react";
import { tween } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScreenshotStream } from "@/hooks/use-screenshot-stream";
import type { RunProgress, TestStepProgress, TestItem } from "@/hooks/use-run-events";
import { TestTimelinePanel } from "@/components/execution/test-timeline-panel";
import { LiveStepPanel, type LiveStep } from "@/components/execution/live-step-panel";
import { FrameScrubber } from "@/components/execution/frame-scrubber";
import { ClosingO } from "@/components/telemetry/closing-o";
import { LiveDot } from "@/components/telemetry/live-dot";

interface LiveViewerProps {
  projectId: string;
  runId: string;
  runStatus?: string;
  enabled?: boolean;
  className?: string;
  progress?: RunProgress | null;
  steps?: TestStepProgress[];
  tests?: TestItem[];
}

export function LiveExecutionViewer({
  projectId,
  runId,
  runStatus = "executing",
  enabled = true,
  className,
  progress,
  steps = [],
  tests = [],
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

  const liveSteps: LiveStep[] = useMemo(
    () => steps.map((s) => ({
      stepIndex: s.stepIndex,
      testCaseId: s.testCaseId,
      action: s.action,
      status: s.status,
    })),
    [steps]
  );

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
    if (isPaused) { resume(); setSelectedFrameIndex(null); }
    else { pause(); }
  }, [isPaused, pause, resume]);

  const hasScreenshots = !!displayedFrame;
  const hasSteps = liveSteps.length > 0;

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Main viewport: the browser in a sunken frame */}
        <div className="flex min-w-0 flex-[7] flex-col">
          <ViewportHeader
            pageUrl={displayedFrame?.pageUrl ?? null}
            viewport={displayedFrame?.viewport ?? null}
            isStreaming={isStreaming}
            runStatus={runStatus}
            currentTest={progress?.currentTest ?? null}
          />

          <div className="relative min-h-[360px] flex-1 bg-tm-sunken">
            <AnimatePresence mode="wait">
              {hasScreenshots ? (
                <motion.img
                  key={displayedFrame.timestamp}
                  src={`data:image/jpeg;base64,${displayedFrame.imageBase64}`}
                  alt="Live browser screenshot"
                  className="absolute inset-0 w-full h-full object-contain"
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={tween.feedback}
                />
              ) : (
                <motion.div
                  key="prep"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <ClosingO size={48} state="running" />
                  <div className="flex flex-col items-center gap-1" role="status">
                    <p className="tm-label text-tm-t3">
                      {progress?.currentTest ? "Running test" : STATUS_MESSAGES[runStatus] ?? "Connecting to browser"}
                    </p>
                    {progress?.currentTest && (
                      <p className="max-w-[300px] truncate text-[13px] text-foreground">{progress.currentTest}</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          <ControlsBar
            isPaused={isPaused}
            onPlayPause={handlePlayPause}
            onDownload={handleDownload}
            hasFrame={hasScreenshots}
            isStreaming={isStreaming}
          />

          <FrameScrubber
            count={frameCount > 0 ? frameHistory.length : 0}
            index={selectedFrameIndex ?? frameHistory.length - 1}
            live={isStreaming && selectedFrameIndex === null}
            onSelect={handleThumbnailSelect}
          />
        </div>

        {/* Right panel: test timeline (primary) or step log (if we have step-level data) */}
        {hasSteps ? (
          <LiveStepPanel
            steps={liveSteps}
            activeStepIndex={liveSteps.length > 0 ? liveSteps[liveSteps.length - 1].stepIndex : null}
            className="border-t border-border lg:max-w-[320px] lg:flex-[3] lg:border-l lg:border-t-0"
          />
        ) : (
          <TestTimelinePanel
            tests={tests}
            totalTests={progress?.totalTests ?? 0}
            className="border-t border-border lg:max-w-[320px] lg:flex-[3] lg:border-l lg:border-t-0"
          />
        )}
      </div>
    </div>
  );
}

const STATUS_MESSAGES: Record<string, string> = {
  queued: "Waiting for a browser",
  indexing: "Indexing the repository",
  planning: "Planning the tests",
  reporting: "Writing up the results",
};

function ViewportHeader({
  pageUrl,
  viewport,
  isStreaming,
  runStatus,
  currentTest,
}: {
  pageUrl: string | null;
  viewport: { width: number; height: number } | null;
  isStreaming: boolean;
  runStatus: string;
  currentTest: string | null;
}) {
  const isActive = isStreaming || ["queued", "executing", "indexing", "planning", "reporting"].includes(runStatus);

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
      {isActive && (
        <span className="tm-label flex shrink-0 items-center gap-1.5 text-tm-live-text">
          <LiveDot size="sm" />
          Live
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-tm-t2">
        {pageUrl ?? currentTest ?? STATUS_MESSAGES[runStatus] ?? "Connecting to browser"}
      </span>
      {viewport && (
        <span className="tm-label shrink-0 text-tm-t3">
          Chromium · {viewport.width}×{viewport.height}
        </span>
      )}
    </div>
  );
}

function ControlsBar({
  isPaused, onPlayPause, onDownload, hasFrame, isStreaming,
}: {
  isPaused: boolean;
  onPlayPause: () => void;
  onDownload: () => void;
  hasFrame: boolean;
  isStreaming: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border px-2 py-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onPlayPause}
        disabled={!isStreaming}
        aria-label={isPaused ? "Follow live" : "Pause on this frame"}
      >
        {isPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" className="size-8" onClick={onDownload} disabled={!hasFrame} aria-label="Download frame">
        <Download aria-hidden="true" />
      </Button>
    </div>
  );
}
