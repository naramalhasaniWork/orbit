"use client";

import { useState, useCallback, useEffect } from "react";
import { useRunEvents } from "@/hooks/use-run-events";
import { LiveViewport } from "@/components/execution/live-viewport";
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
  onConfigureEnv?: () => void;
}

type RunState = "ready" | "running" | "complete" | "error";

export function LaunchRun({ projectId, enabledTestCount, repoName, onBack, onConfigureEnv }: LaunchRunProps) {
  const [runState, setRunState] = useState<RunState>("ready");
  const [runId, setRunId] = useState<string | null>(null);
  const [runningTests, setRunningTests] = useState<TestProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleRunComplete = useCallback(() => {
    setRunState("complete");
  }, []);

  useRunEvents({
    projectId,
    runId: runId ?? "",
    enabled: runState === "running" && !!runId,
    onComplete: handleRunComplete,
    onTestStarted: (data) => {
      setRunningTests((prev) => {
        const existing = prev.findIndex((t) => t.name === data.testCaseName);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], status: "running" };
          return next;
        }
        return [...prev, { name: data.testCaseName, status: "running" }];
      });
    },
    onTestCompleted: (data) => {
      setRunningTests((prev) => {
        const existing = prev.findIndex((t) => t.name === data.testCaseName);
        const status = data.verdict === "pass" || data.verdict === "healed" ? "pass" : "fail";
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], status };
          return next;
        }
        return [...prev, { name: data.testCaseName, status }];
      });
    },
  });

  const launch = useCallback(async () => {
    setRunState("running");
    setError(null);
    setRunningTests([]);

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

      setRunId(json.data.id as string);
    } catch {
      setError("Failed to connect to server");
      setRunState("error");
    }
  }, [projectId]);

  // Mark onboarding as completed when run finishes
  useEffect(() => {
    if (runState !== "complete") return;
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCompleted: true }),
    }).catch(() => {
      // Non-critical
    });
  }, [runState, projectId]);

  const passCount = runningTests.filter((t) => t.status === "pass").length;
  const failCount = runningTests.filter((t) => t.status === "fail").length;

  const showViewport = (runState === "running" || runState === "complete") && !!runId;

  return (
    <div className={showViewport ? "w-full max-w-4xl mx-auto" : "flex flex-col items-center w-full max-w-lg mx-auto"}>
      {runState === "ready" && (
        <ReadyView
          enabledTestCount={enabledTestCount}
          repoName={repoName}
          onLaunch={launch}
          onBack={onBack}
        />
      )}

      {showViewport && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Live browser viewport — the "wow moment" */}
          <div className="lg:col-span-3">
            <LiveViewport
              projectId={projectId}
              runId={runId}
              enabled={runState === "running"}
            />
          </div>

          {/* Test progress sidebar */}
          <div className="lg:col-span-2 flex flex-col items-center">
            {runState === "running" && (
              <RunningView
                tests={runningTests}
                passCount={passCount}
                failCount={failCount}
              />
            )}

            {runState === "complete" && (
              <CompleteView
                total={runningTests.length || enabledTestCount}
                passCount={passCount}
                failCount={failCount}
                projectId={projectId}
              />
            )}
          </div>
        </div>
      )}

      {runState === "error" && error && (
        <ErrorView
          error={error}
          onRetry={launch}
          onBack={onBack}
          onConfigureEnv={error.includes("environment") ? onConfigureEnv : undefined}
        />
      )}
    </div>
  );
}
