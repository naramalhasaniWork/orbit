"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, WifiOff, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrowserViewport } from "@/hooks/use-browser-viewport";
import { ViewportToolbar } from "@/components/execution/viewport-toolbar";

interface LiveViewportProps {
  projectId: string;
  runId: string;
  enabled?: boolean;
  className?: string;
  /** Compact mode hides toolbar details */
  compact?: boolean;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5];
const DEFAULT_ZOOM_INDEX = 2;

export function LiveViewport({
  projectId,
  runId,
  enabled = true,
  className,
  compact = false,
}: LiveViewportProps) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    status,
    currentFrame,
    previousFrame,
    currentUrl,
    currentStep,
    currentTestName,
    frameCount,
    connected,
    error,
  } = useBrowserViewport({ projectId, runId, enabled });

  const zoom = ZOOM_LEVELS[zoomIndex];

  const handleZoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-xl border border-white/[0.06] overflow-hidden",
        "bg-[hsl(var(--orbit-bg-deeper,222_47%_6%))]",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-none",
        className
      )}
    >
      {/* Toolbar */}
      {!compact && (
        <ViewportToolbar
          currentUrl={currentUrl}
          currentStep={currentStep}
          currentTestName={currentTestName}
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          canZoomIn={zoomIndex < ZOOM_LEVELS.length - 1}
          canZoomOut={zoomIndex > 0}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          connected={connected}
          status={status}
        />
      )}

      {/* Viewport area */}
      <div
        className={cn(
          "relative overflow-hidden bg-black/20",
          isFullscreen ? "h-[calc(100vh-48px)]" : "aspect-video",
        )}
      >
        {/* Loading state */}
        {(status === "idle" || status === "waiting") && (
          <ViewportPlaceholder
            message={
              status === "idle"
                ? "Waiting for stream..."
                : "Connected. Waiting for screenshots..."
            }
            icon={<Loader2 className="h-6 w-6 animate-spin text-orbit-accent" />}
          />
        )}

        {/* Error state */}
        {error && !connected && status !== "completed" && (
          <ViewportPlaceholder
            message={error}
            icon={<WifiOff className="h-6 w-6 text-orbit-fail" />}
          />
        )}

        {/* Completed state — no screenshot available */}
        {status === "completed" && !currentFrame && (
          <ViewportPlaceholder
            message="Run completed"
            icon={<CheckCircle2 className="h-6 w-6 text-orbit-pass" />}
          />
        )}

        {/* Screenshot frames with crossfade */}
        <div
          className="relative w-full h-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          <AnimatePresence mode="popLayout">
            {previousFrame && currentFrame && previousFrame.screenshotUrl !== currentFrame.screenshotUrl && (
              <motion.img
                key={`prev-${previousFrame.timestamp}`}
                src={previousFrame.screenshotUrl}
                alt="Previous browser state"
                className="absolute inset-0 w-full h-full object-contain"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              />
            )}
            {currentFrame && (
              <motion.img
                key={`current-${currentFrame.timestamp}`}
                src={currentFrame.screenshotUrl}
                alt="Live browser viewport"
                className="absolute inset-0 w-full h-full object-contain"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Completed overlay on final screenshot */}
        {status === "completed" && currentFrame && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2">
              <CheckCircle2 className="h-5 w-5 text-orbit-pass" />
              <span className="text-sm font-medium text-white">Run completed</span>
            </div>
          </div>
        )}

        {/* Frame counter */}
        {frameCount > 0 && status === "streaming" && (
          <div className="absolute bottom-2 right-2 text-[10px] tabular-nums text-white/50 bg-black/40 rounded px-1.5 py-0.5">
            {frameCount} frames
          </div>
        )}
      </div>

      {/* Compact toolbar at bottom */}
      {compact && currentStep && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground truncate border-t border-white/[0.04]">
          {currentTestName && (
            <span className="font-medium text-foreground mr-2">{currentTestName}</span>
          )}
          {currentStep}
        </div>
      )}
    </div>
  );
}

function ViewportPlaceholder({
  message,
  icon,
}: {
  message: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      {icon}
      <span className="text-xs text-muted-foreground">{message}</span>
    </div>
  );
}
