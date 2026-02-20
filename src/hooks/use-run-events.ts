"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSSE } from "@/hooks/use-sse";
import type {
  TestStartedEvent,
  TestStepEvent,
  TestCompletedEvent,
  TestScreenshotEvent,
} from "@/lib/websocket/channels";

export interface RunProgress {
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  completed: number;
  currentTest: string | null;
  lastVerdict: string | null;
  durationMs: number | null;
}

export interface TestStepProgress {
  testCaseId: string;
  stepIndex: number;
  action: string;
  status: "running" | "passed" | "failed";
  screenshotUrl?: string;
}

interface UseRunEventsOptions {
  projectId: string;
  runId: string;
  enabled?: boolean;
  onComplete?: (data: RunProgress) => void;
  onTestStarted?: (data: TestStartedEvent) => void;
  onTestStep?: (data: TestStepEvent) => void;
  onTestCompleted?: (data: TestCompletedEvent) => void;
  onScreenshot?: (data: TestScreenshotEvent) => void;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function useRunEvents({
  projectId,
  runId,
  enabled = true,
  onComplete,
  onTestStarted,
  onTestStep,
  onTestCompleted,
  onScreenshot,
}: UseRunEventsOptions) {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [steps, setSteps] = useState<TestStepProgress[]>([]);

  // Stable callback refs
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onTestStartedRef = useRef(onTestStarted);
  onTestStartedRef.current = onTestStarted;
  const onTestStepRef = useRef(onTestStep);
  onTestStepRef.current = onTestStep;
  const onTestCompletedRef = useRef(onTestCompleted);
  onTestCompletedRef.current = onTestCompleted;
  const onScreenshotRef = useRef(onScreenshot);
  onScreenshotRef.current = onScreenshot;

  const handleEvent = useCallback((event: { type: string; data: unknown }) => {
    const payload = event.data as Record<string, unknown>;

    switch (event.type) {
      case "run:started": {
        setProgress({
          status: "executing",
          totalTests: (payload.totalTests as number) ?? 0,
          passed: 0,
          failed: 0,
          flaky: 0,
          completed: 0,
          currentTest: null,
          lastVerdict: null,
          durationMs: null,
        });
        break;
      }

      case "run:progress": {
        setProgress((prev) => ({
          ...(prev ?? {
            totalTests: 0,
            passed: 0,
            failed: 0,
            flaky: 0,
            completed: 0,
            currentTest: null,
            lastVerdict: null,
            durationMs: null,
          }),
          status: payload.status as string,
          currentTest: (payload.currentTest as string) ?? prev?.currentTest ?? null,
          totalTests: (payload.totalTests as number) ?? prev?.totalTests ?? 0,
          passed: (payload.passed as number) ?? prev?.passed ?? 0,
          failed: (payload.failed as number) ?? prev?.failed ?? 0,
          flaky: prev?.flaky ?? 0,
          completed: ((payload.passed as number) ?? 0) + ((payload.failed as number) ?? 0),
          lastVerdict: prev?.lastVerdict ?? null,
          durationMs: prev?.durationMs ?? null,
        }));
        break;
      }

      case "run:completed": {
        const final: RunProgress = {
          status: (payload.status as string) ?? "completed",
          totalTests: (payload.totalTests as number) ?? 0,
          passed: (payload.passed as number) ?? 0,
          failed: (payload.failed as number) ?? 0,
          flaky: (payload.flaky as number) ?? 0,
          completed: ((payload.passed as number) ?? 0) + ((payload.failed as number) ?? 0),
          currentTest: null,
          lastVerdict: null,
          durationMs: (payload.durationMs as number) ?? null,
        };
        setProgress(final);
        onCompleteRef.current?.(final);
        break;
      }

      case "test:started": {
        const data = payload as unknown as TestStartedEvent;
        setProgress((prev) => prev ? { ...prev, currentTest: data.testCaseName } : prev);
        onTestStartedRef.current?.(data);
        break;
      }

      case "test:step": {
        const data = payload as unknown as TestStepEvent;
        setSteps((prev) => {
          const existing = prev.findIndex(
            (s) => s.testCaseId === data.testCaseId && s.stepIndex === data.stepIndex
          );
          const step: TestStepProgress = {
            testCaseId: data.testCaseId,
            stepIndex: data.stepIndex,
            action: data.action,
            status: data.status,
            screenshotUrl: data.screenshotUrl,
          };
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = step;
            return next;
          }
          return [...prev, step];
        });
        onTestStepRef.current?.(data);
        break;
      }

      case "test:completed": {
        const data = payload as unknown as TestCompletedEvent;
        setProgress((prev) => {
          if (!prev) return prev;
          const passed = prev.passed + (data.verdict === "pass" || data.verdict === "healed" ? 1 : 0);
          const failed = prev.failed + (data.verdict === "fail" ? 1 : 0);
          const flaky = prev.flaky + (data.verdict === "flaky" ? 1 : 0);
          return {
            ...prev,
            passed,
            failed,
            flaky,
            completed: passed + failed + flaky,
            lastVerdict: data.verdict,
            currentTest: data.testCaseName,
          };
        });
        // Clear steps for this test
        setSteps((prev) => prev.filter((s) => s.testCaseId !== data.testCaseId));
        onTestCompletedRef.current?.(data);
        break;
      }

      case "test:screenshot": {
        const data = payload as unknown as TestScreenshotEvent;
        onScreenshotRef.current?.(data);
        break;
      }
    }
  }, []);

  const url = `/api/projects/${projectId}/runs/${runId}/progress`;
  const isEnabled = enabled && !!runId && !!projectId;

  const { connected, error } = useSSE({
    url,
    enabled: isEnabled,
    onEvent: handleEvent,
  });

  // Also disable when terminal
  const isTerminal = progress ? TERMINAL_STATUSES.has(progress.status) : false;

  // If we're connected but the progress is terminal, we don't need to track steps anymore
  useEffect(() => {
    if (isTerminal) {
      setSteps([]);
    }
  }, [isTerminal]);

  return { progress, steps, connected, error };
}
