"use client";

import { useState, useCallback, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";

// ============================================================
// Types
// ============================================================

export interface ScreenshotFrame {
  runId: string;
  testCaseId: string;
  stepIndex: number;
  timestamp: number;
  imageBase64: string;
  pageUrl: string;
  viewport: { width: number; height: number };
}

interface UseScreenshotStreamOptions {
  projectId: string;
  runId: string | null;
  enabled?: boolean;
  maxHistory?: number;
}

interface UseScreenshotStreamReturn {
  currentFrame: ScreenshotFrame | null;
  frameHistory: ScreenshotFrame[];
  isStreaming: boolean;
  isComplete: boolean;
  connected: boolean;
  error: string | null;
  frameCount: number;
  pause: () => void;
  resume: () => void;
  isPaused: boolean;
}

// ============================================================
// Hook
// ============================================================

const DEFAULT_MAX_HISTORY = 100;

export function useScreenshotStream({
  projectId,
  runId,
  enabled = true,
  maxHistory = DEFAULT_MAX_HISTORY,
}: UseScreenshotStreamOptions): UseScreenshotStreamReturn {
  const [currentFrame, setCurrentFrame] = useState<ScreenshotFrame | null>(null);
  const [frameHistory, setFrameHistory] = useState<ScreenshotFrame[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const isPausedRef = useRef(false);

  const handleEvent = useCallback(
    (event: { type: string; data: unknown }) => {
      const payload = event.data as Record<string, unknown>;

      switch (event.type) {
        case "connected": {
          setIsStreaming(true);
          break;
        }

        case "screenshot:frame": {
          const frame = payload as unknown as ScreenshotFrame;

          // Always add to history
          setFrameHistory((prev) => {
            const next = [...prev, frame];
            return next.length > maxHistory ? next.slice(-maxHistory) : next;
          });

          // Only update current frame if not paused
          if (!isPausedRef.current) {
            setCurrentFrame(frame);
          }
          break;
        }

        case "screenshots:complete":
        case "run:completed": {
          setIsStreaming(false);
          setIsComplete(true);
          break;
        }
      }
    },
    [maxHistory]
  );

  const url = runId
    ? `/api/projects/${projectId}/runs/${runId}/screenshots`
    : "";
  const isEnabled = enabled && !!runId && !!projectId;

  const { connected, error } = useSSE({
    url,
    enabled: isEnabled,
    onEvent: handleEvent,
  });

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    // Jump to the latest frame in history
    setFrameHistory((prev) => {
      if (prev.length > 0) {
        setCurrentFrame(prev[prev.length - 1]);
      }
      return prev;
    });
  }, []);

  return {
    currentFrame,
    frameHistory,
    isStreaming,
    isComplete,
    connected,
    error,
    frameCount: frameHistory.length,
    pause,
    resume,
    isPaused,
  };
}
