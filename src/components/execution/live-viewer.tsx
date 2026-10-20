"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Pause,
  Play,
  Download,
  Loader2,
  Cpu,
} from "lucide-react";
import { tween } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScreenshotStream } from "@/hooks/use-screenshot-stream";
import type { RunProgress, TestStepProgress, TestItem } from "@/hooks/use-run-events";
import { TestTimelinePanel } from "@/components/execution/test-timeline-panel";
import { LiveStepPanel, type LiveStep } from "@/components/execution/live-step-panel";
import { ScreenshotThumbnailStrip } from "@/components/execution/screenshot-thumbnail-strip";

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
    <div className={cn("flex flex-col rounded-xl border border-border overflow-hidden bg-[hsl(var(--orbit-bg-deeper,222_47%_6%))]", className)}>
      <div className="flex flex-1 min-h-0">
        {/* Main viewport */}
        <div className="flex flex-col flex-[7] min-w-0">
          <ViewportHeader
            pageUrl={displayedFrame?.pageUrl ?? null}
            viewport={displayedFrame?.viewport ?? null}
            isStreaming={isStreaming}
            runStatus={runStatus}
            currentTest={progress?.currentTest ?? null}
          />

          <div className="relative flex-1 bg-black/20 min-h-[360px]">
            <AnimatePresence mode="wait">
              {hasScreenshots ? (
                <motion.img
                  key={displayedFrame.timestamp}
                  src={`data:image/jpeg;base64,${displayedFrame.imageBase64}`}
                  alt="Live browser screenshot"
                  className="absolute inset-0 w-full h-full object-contain"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.005 }}
                  transition={tween.change}
                />
              ) : (
                <motion.div
                  key="prep"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <PreparationOrbit runStatus={runStatus} />
                  {progress?.currentTest ? (
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-xs font-medium text-foreground/70">Running test</p>
                      <p className="text-xs text-muted-foreground max-w-[300px] truncate">{progress.currentTest}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {STATUS_MESSAGES[runStatus] ?? "Connecting to browser..."}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {frameCount > 0 && (
              <motion.div
                key={frameCount}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={tween.change}
                className="absolute bottom-2 right-2 text-[10px] tabular-nums text-white/50 bg-black/40 rounded px-1.5 py-0.5 backdrop-blur-sm"
              >
                {frameCount} frames
              </motion.div>
            )}
          </div>

          <ControlsBar
            isPaused={isPaused}
            onPlayPause={handlePlayPause}
            onDownload={handleDownload}
            hasFrame={hasScreenshots}
            isStreaming={isStreaming}
          />

          {frameHistory.length > 0 && (
            <ScreenshotThumbnailStrip
              frames={frameHistory}
              activeIndex={selectedFrameIndex ?? (frameHistory.length - 1)}
              onSelect={handleThumbnailSelect}
            />
          )}
        </div>

        {/* Right panel: test timeline (primary) or step log (if we have step-level data) */}
        {hasSteps ? (
          <LiveStepPanel
            steps={liveSteps}
            activeStepIndex={liveSteps.length > 0 ? liveSteps[liveSteps.length - 1].stepIndex : null}
            className="flex-[3] max-w-[350px]"
          />
        ) : (
          <TestTimelinePanel
            tests={tests}
            totalTests={progress?.totalTests ?? 0}
            className="flex-[3] max-w-[350px]"
          />
        )}
      </div>
    </div>
  );
}

function PreparationOrbit({ runStatus }: { runStatus: string }) {
  return (
    <div className="relative w-20 h-20">
      <motion.div className="absolute inset-0 rounded-full border-2 border-orbit-accent/15" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} />
      <motion.div className="absolute inset-2 rounded-full border border-dashed border-orbit-accent/10" animate={{ rotate: -360 }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }} />
      <motion.div className="absolute inset-4 rounded-full border border-orbit-accent/[0.07]" animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
      <motion.div className="absolute inset-0 flex items-center justify-center" animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}>
        {runStatus === "queued" ? <Loader2 className="h-6 w-6 text-orbit-accent animate-spin" /> : <Cpu className="h-6 w-6 text-orbit-accent" />}
      </motion.div>
      <motion.div className="absolute w-1.5 h-1.5 rounded-full bg-orbit-accent shadow-[0_0_8px_hsl(var(--orbit-accent)/0.6)]" style={{ top: -3, left: "calc(50% - 3px)", transformOrigin: "3px 43px" }} animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
      <motion.div className="absolute w-1 h-1 rounded-full bg-orbit-accent/40 shadow-[0_0_4px_hsl(var(--orbit-accent)/0.3)]" style={{ bottom: -2, left: "calc(50% - 2px)", transformOrigin: "2px -38px" }} animate={{ rotate: -360 }} transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }} />
    </div>
  );
}


const STATUS_MESSAGES: Record<string, string> = {
  queued: "Waiting for worker...",
  indexing: "Indexing repository...",
  planning: "Generating test plan...",
  reporting: "Analyzing results...",
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
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-foreground/[0.02] shrink-0">
      {isActive && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
        </div>
      )}

      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {pageUrl ? (
          <>
            <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono truncate">{pageUrl}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground truncate">
            {currentTest ?? (STATUS_MESSAGES[runStatus] ?? "Connecting to browser...")}
          </span>
        )}
      </div>

      {viewport && (
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{viewport.width}x{viewport.height}</span>
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
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-foreground/[0.02] shrink-0">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPlayPause} disabled={!isStreaming}>
        {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDownload} disabled={!hasFrame}>
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
