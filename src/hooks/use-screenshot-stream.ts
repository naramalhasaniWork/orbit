"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";
import type { ScreenshotFrameEvent } from "@/lib/websocket/channels";

// ============================================================
// Types
// ============================================================

export interface ScreenshotFrame extends Omit<ScreenshotFrameEvent, "frameKey"> {
  imageBase64: string;
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Fetches the JPEG behind a frame pointer; null when it expired or is not ours to see. */
async function fetchFrame(projectId: string, event: ScreenshotFrameEvent): Promise<ScreenshotFrame | null> {
  const res = await fetch(`/api/projects/${projectId}/runs/${event.runId}/frames/${event.frameKey}`);
  if (!res.ok) return null;
  const { frameKey: _frameKey, ...frame } = event;
  return { ...frame, imageBase64: await blobToBase64(await res.blob()) };
}

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
  // Frames download in parallel but are applied in event order.
  const applyQueueRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1; // drop in-flight frames from a previous run
  }, [projectId, runId]);

  const addFrame = useCallback(
    (frame: ScreenshotFrame) => {
      // Always add to history
      setFrameHistory((prev) => {
        const next = [...prev, frame];
        return next.length > maxHistory ? next.slice(-maxHistory) : next;
      });

      // Only update current frame if not paused
      if (!isPausedRef.current) {
        setCurrentFrame(frame);
      }
    },
    [maxHistory]
  );

  const handleEvent = useCallback(
    (event: { type: string; data: unknown }) => {
      const payload = event.data as Record<string, unknown>;

      switch (event.type) {
        case "connected": {
          setIsStreaming(true);
          break;
        }

        case "screenshot:frame": {
          const generation = generationRef.current;
          const download = fetchFrame(projectId, payload as unknown as ScreenshotFrameEvent).catch(() => null);
          applyQueueRef.current = applyQueueRef.current.then(async () => {
            const frame = await download;
            if (frame && generation === generationRef.current) addFrame(frame);
          });
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
    [projectId, addFrame]
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
