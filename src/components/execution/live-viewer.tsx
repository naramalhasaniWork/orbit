"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Pause,
  Play,
  Download,
  Monitor,
  Shield,
  Cpu,
  Rocket,
  FileSearch,
  BrainCircuit,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useScreenshotStream } from "@/hooks/use-screenshot-stream";
import { useRunEvents, type TestStepProgress } from "@/hooks/use-run-events";
import { LiveStepPanel, type LiveStep } from "@/components/execution/live-step-panel";
import { ScreenshotThumbnailStrip } from "@/components/execution/screenshot-thumbnail-strip";

interface LiveViewerProps {
  projectId: string;
  runId: string;
  runStatus?: string;
  enabled?: boolean;
  className?: string;
}

export function LiveExecutionViewer({
  projectId,
  runId,
  runStatus = "executing",
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

  const { steps: rawSteps, progress } = useRunEvents({
    projectId,
    runId,
    enabled,
  });

  const liveSteps: LiveStep[] = useMemo(
    () => rawSteps.map(toLiveStep),
    [rawSteps]
  );

  const activeStepIndex = liveSteps.length > 0
    ? liveSteps[liveSteps.length - 1].stepIndex
    : null;

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

  const hasScreenshots = !!displayedFrame;

  return (
    <div className={cn("flex flex-col rounded-xl border border-white/[0.06] overflow-hidden bg-[hsl(var(--orbit-bg-deeper,222_47%_6%))]", className)}>
      <div className="flex flex-1 min-h-0">
        {/* Viewport */}
        <div className="flex flex-col flex-[7] min-w-0">
          <ViewportHeader
            pageUrl={displayedFrame?.pageUrl ?? null}
            viewport={displayedFrame?.viewport ?? null}
            isStreaming={isStreaming}
            runStatus={runStatus}
          />

          <div className="relative flex-1 bg-black/20 min-h-[360px]">
            <AnimatePresence mode="wait">
              {hasScreenshots ? (
                <motion.img
                  key={displayedFrame.timestamp}
                  src={`data:image/jpeg;base64,${displayedFrame.imageBase64}`}
                  alt="Live browser screenshot"
                  className="absolute inset-0 w-full h-full object-contain"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                />
              ) : (
                <motion.div
                  key="preparation"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <PreparationPhase
                    runStatus={runStatus}
                    currentTest={progress?.currentTest ?? null}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {frameCount > 0 && (
              <div className="absolute bottom-2 right-2 text-[10px] tabular-nums text-white/50 bg-black/40 rounded px-1.5 py-0.5 backdrop-blur-sm">
                {frameCount} frames
              </div>
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

        {/* Step log panel */}
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
// Preparation Phase — Animated pre-execution UI
// ============================================================

const PHASES = [
  { key: "queued", icon: Loader2, label: "Queued", detail: "Waiting for worker slot..." },
  { key: "validating", icon: Shield, label: "Validating Environment", detail: "Checking URL reachability and credentials..." },
  { key: "launching", icon: Monitor, label: "Launching Browser", detail: "Connecting to headless browser via CDP..." },
  { key: "loading", icon: Globe, label: "Loading Page", detail: "Navigating to staging environment..." },
  { key: "executing", icon: Cpu, label: "Executing Tests", detail: "Running test steps..." },
  { key: "indexing", icon: FileSearch, label: "Indexing Repository", detail: "Analyzing codebase structure..." },
  { key: "planning", icon: BrainCircuit, label: "Generating Test Plan", detail: "AI is building test scenarios..." },
  { key: "reporting", icon: Rocket, label: "Generating Report", detail: "Analyzing results and failures..." },
] as const;

function getPhaseIndex(runStatus: string): number {
  if (runStatus === "queued") return 0;
  if (runStatus === "indexing") return 5;
  if (runStatus === "planning") return 6;
  if (runStatus === "reporting") return 7;
  return 4;
}

function PreparationPhase({
  runStatus,
  currentTest,
}: {
  runStatus: string;
  currentTest: string | null;
}) {
  const activePhaseIndex = getPhaseIndex(runStatus);
  const showExecutionPhases = runStatus === "executing" || runStatus === "queued";
  const displayPhases = showExecutionPhases ? PHASES.slice(0, 5) : [PHASES[activePhaseIndex]];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8">
      {/* Animated orbit ring */}
      <div className="relative w-20 h-20">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-orbit-accent/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-1 rounded-full border border-dashed border-orbit-accent/10"
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {(() => {
            const Icon = PHASES[activePhaseIndex]?.icon ?? Loader2;
            return <Icon className="h-8 w-8 text-orbit-accent" />;
          })()}
        </motion.div>
        {/* Orbiting dot */}
        <motion.div
          className="absolute w-2 h-2 rounded-full bg-orbit-accent shadow-[0_0_8px_rgba(var(--orbit-accent-rgb,255_140_50),0.6)]"
          style={{ top: -4, left: "calc(50% - 4px)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Phase steps */}
      <div className="flex flex-col gap-1.5 max-w-xs w-full">
        {displayPhases.map((phase, i) => {
          const isActive = showExecutionPhases ? i === activePhaseIndex : true;
          const isDone = showExecutionPhases ? i < activePhaseIndex : false;

          return (
            <motion.div
              key={phase.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                isActive && "bg-orbit-accent/[0.06] border border-orbit-accent/20",
                isDone && "opacity-50",
                !isActive && !isDone && "opacity-30"
              )}
            >
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-orbit-pass" />
                ) : isActive ? (
                  <motion.div
                    animate={{ rotate: phase.key === "queued" || phase.key === "executing" ? 360 : 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  >
                    <phase.icon className="h-4 w-4 text-orbit-accent" />
                  </motion.div>
                ) : (
                  <phase.icon className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn(
                  "text-xs font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}>
                  {phase.label}
                </span>
                {isActive && (
                  <motion.p
                    className="text-[10px] text-muted-foreground mt-0.5 truncate"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                  >
                    {currentTest ?? phase.detail}
                  </motion.p>
                )}
              </div>
              {isActive && (
                <motion.div
                  className="h-1 w-8 rounded-full bg-orbit-accent/20 overflow-hidden shrink-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="h-full bg-orbit-accent rounded-full"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </motion.div>
          );
        })}
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
  runStatus,
}: {
  pageUrl: string | null;
  viewport: { width: number; height: number } | null;
  isStreaming: boolean;
  runStatus: string;
}) {
  const isActive = isStreaming || ["queued", "executing", "indexing", "planning", "reporting"].includes(runStatus);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-white/[0.02] shrink-0">
      {isActive && (
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

      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {pageUrl ? (
          <>
            <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono truncate">
              {pageUrl}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {runStatus === "queued" ? "Waiting to start..." : "Preparing browser..."}
          </span>
        )}
      </div>

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

function toLiveStep(step: TestStepProgress): LiveStep {
  return {
    stepIndex: step.stepIndex,
    testCaseId: step.testCaseId,
    action: step.action,
    status: step.status,
  };
}
