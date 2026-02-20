"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { RunStatus } from "../onboarding-types";
import {
  ReadyView,
  RunningView,
  CompleteView,
  ErrorView,
  type TestProgress,
} from "./launch-run-views";

interface LaunchRunProps {
  projectId: string;
  enabledTestCount: number;
  repoName: string;
  onBack: () => void;
}

type RunState = "ready" | "running" | "complete" | "error";

export function LaunchRun({ projectId, enabledTestCount, repoName, onBack }: LaunchRunProps) {
  const [runState, setRunState] = useState<RunState>("ready");
  const [runningTests, setRunningTests] = useState<TestProgress[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const launch = useCallback(async () => {
    setRunState("running");
    setError(null);
    cancelledRef.current = false;

    try {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Failed to start run");
        setRunState("error");
        return;
      }

      const runId = json.data.id as string;

      // Poll for run status
      for (let i = 0; i < 120; i++) {
        if (cancelledRef.current) return;
        await new Promise((r) => setTimeout(r, 3000));

        try {
          const statusRes = await fetch(`/api/projects/${projectId}/runs/${runId}`);
          const statusJson = await statusRes.json();
          if (!statusRes.ok || !statusJson.success) continue;

          const data = statusJson.data as RunStatus;
          const total = data.totalTests || enabledTestCount;
          const completed = data.passed + data.failed + data.flaky + data.skipped;

          setProgress(total > 0 ? Math.round((completed / total) * 100) : 0);

          // Build test progress from results
          if (data.results && data.results.length > 0) {
            const testItems: TestProgress[] = data.results.map((r) => ({
              name: r.testCase?.name ?? `Test ${r.testCaseId.slice(0, 8)}`,
              status: r.verdict === "pass" || r.verdict === "healed"
                ? "pass"
                : r.verdict === "fail" || r.verdict === "flaky"
                  ? "fail"
                  : "pending",
            }));

            // Add remaining tests as pending
            const remaining = total - testItems.length;
            for (let j = 0; j < remaining; j++) {
              testItems.push({
                name: `Test case ${testItems.length + j + 1}`,
                status: j === 0 ? "running" : "pending",
              });
            }

            setRunningTests(testItems);
          }

          if (data.status === "completed" || data.status === "failed") {
            setProgress(100);
            setRunState("complete");
            return;
          }
        } catch {
          // Continue polling
        }
      }

      // Timed out — still show as complete
      setRunState("complete");
    } catch {
      setError("Failed to connect to server");
      setRunState("error");
    }
  }, [projectId, enabledTestCount]);

  // Mark onboarding as completed when run finishes
  useEffect(() => {
    if (runState !== "complete") return;
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCompleted: true }),
    }).catch(() => {
      // Non-critical — don't block the UI
    });
  }, [runState, projectId]);

  const passCount = runningTests.filter((t) => t.status === "pass").length;
  const failCount = runningTests.filter((t) => t.status === "fail").length;

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto">
      {runState === "ready" && (
        <ReadyView
          enabledTestCount={enabledTestCount}
          repoName={repoName}
          onLaunch={launch}
          onBack={onBack}
        />
      )}

      {runState === "running" && (
        <RunningView
          tests={runningTests}
          progress={progress}
          passCount={passCount}
          failCount={failCount}
        />
      )}

      {runState === "complete" && (
        <CompleteView
          total={runningTests.length || enabledTestCount}
          passCount={passCount}
          failCount={failCount}
        />
      )}

      {runState === "error" && error && (
        <ErrorView error={error} onRetry={launch} onBack={onBack} />
      )}
    </div>
  );
}
