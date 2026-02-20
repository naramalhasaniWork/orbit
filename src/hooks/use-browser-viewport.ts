"use client";

import { useState, useCallback, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";
import type {
  TestStepEvent,
  TestScreenshotEvent,
  TestStartedEvent,
  TestCompletedEvent,
} from "@/lib/websocket/channels";

export interface ViewportFrame {
  screenshotUrl: string;
  stepIndex: number;
  testCaseId: string;
  timestamp: number;
}

export interface ViewportState {
  status: "idle" | "waiting" | "streaming" | "completed" | "error";
  currentFrame: ViewportFrame | null;
  previousFrame: ViewportFrame | null;
  currentUrl: string | null;
  currentStep: string | null;
  currentTestName: string | null;
  frameCount: number;
}

interface UseBrowserViewportOptions {
  projectId: string;
  runId: string;
  enabled?: boolean;
  onFrame?: (frame: ViewportFrame) => void;
}

/**
 * Streams browser screenshots during live test execution.
 * Consumes test:screenshot and test:step events from the run's
 * SSE stream and maintains the current viewport image with
 * crossfade support (exposes both current and previous frame).
 */
export function useBrowserViewport({
  projectId,
  runId,
  enabled = true,
  onFrame,
}: UseBrowserViewportOptions) {
  const [state, setState] = useState<ViewportState>({
    status: "idle",
    currentFrame: null,
    previousFrame: null,
    currentUrl: null,
    currentStep: null,
    currentTestName: null,
    frameCount: 0,
  });

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const handleEvent = useCallback((event: { type: string; data: unknown }) => {
    const payload = event.data as Record<string, unknown>;

    switch (event.type) {
      case "connected": {
        setState((prev) => ({
          ...prev,
          status: prev.status === "idle" ? "waiting" : prev.status,
        }));
        break;
      }

      case "test:started": {
        const data = payload as unknown as TestStartedEvent;
        setState((prev) => ({
          ...prev,
          status: "streaming",
          currentTestName: data.testCaseName,
          currentStep: null,
        }));
        break;
      }

      case "test:screenshot": {
        const data = payload as unknown as TestScreenshotEvent;
        const frame: ViewportFrame = {
          screenshotUrl: data.screenshotUrl,
          stepIndex: data.stepIndex,
          testCaseId: data.testCaseId,
          timestamp: data.timestamp,
        };
        setState((prev) => ({
          ...prev,
          status: "streaming",
          previousFrame: prev.currentFrame,
          currentFrame: frame,
          frameCount: prev.frameCount + 1,
        }));
        onFrameRef.current?.(frame);
        break;
      }

      case "test:step": {
        const data = payload as unknown as TestStepEvent;
        setState((prev) => {
          const updates: Partial<ViewportState> = {
            status: "streaming",
            currentStep: data.action,
          };
          // If step carries a screenshot, update the viewport frame
          if (data.screenshotUrl) {
            const frame: ViewportFrame = {
              screenshotUrl: data.screenshotUrl,
              stepIndex: data.stepIndex,
              testCaseId: data.testCaseId,
              timestamp: Date.now(),
            };
            updates.previousFrame = prev.currentFrame;
            updates.currentFrame = frame;
            updates.frameCount = prev.frameCount + 1;
            onFrameRef.current?.(frame);
          }
          return { ...prev, ...updates };
        });
        break;
      }

      case "test:completed": {
        const data = payload as unknown as TestCompletedEvent;
        setState((prev) => ({
          ...prev,
          currentTestName: data.testCaseName,
          currentStep: `${data.verdict} (${data.durationMs}ms)`,
        }));
        break;
      }

      case "run:completed": {
        setState((prev) => ({
          ...prev,
          status: "completed",
          currentStep: null,
        }));
        break;
      }
    }
  }, []);

  const url = `/api/projects/${projectId}/runs/${runId}/progress`;

  const { connected, error } = useSSE({
    url,
    enabled: enabled && !!runId && !!projectId,
    onEvent: handleEvent,
  });

  return {
    ...state,
    connected,
    error,
  };
}
