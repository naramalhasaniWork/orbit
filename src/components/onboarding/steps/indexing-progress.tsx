"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Check, Loader2, Circle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RepoItem, SyncStatus } from "../onboarding-types";

const PHASES = [
  { id: "clone", label: "Cloning repository" },
  { id: "framework", label: "Detecting framework" },
  { id: "ast", label: "Parsing AST" },
  { id: "routes", label: "Extracting routes" },
  { id: "components", label: "Mapping components" },
  { id: "embeddings", label: "Generating embeddings" },
];

function phaseIndexFromProgress(progress: number): number {
  if (progress >= 100) return PHASES.length;
  return Math.min(Math.floor((progress / 100) * PHASES.length), PHASES.length - 1);
}

interface IndexingProgressProps {
  repo: RepoItem;
  projectId: string;
  onComplete: () => void;
}

function PhaseIcon({ status }: { status: "pending" | "running" | "complete" }) {
  if (status === "complete") return <Check className="h-4 w-4 text-orbit-pass" />;
  if (status === "running") return <Loader2 className="h-4 w-4 text-orbit-accent animate-spin" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export function IndexingProgress({ repo, projectId, onComplete }: IndexingProgressProps) {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus["status"]>("waiting");
  const startedRef = useRef(false);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, message]);
  }, []);

  // Trigger sync and listen for progress
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    const startSync = async () => {
      addLog(`[start] Triggering indexing for ${repo.fullName}...`);

      try {
        const res = await fetch(`/api/projects/${projectId}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branch: repo.defaultBranch }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(json.error?.message ?? "Failed to start indexing");
          return;
        }

        addLog(`[done]  Indexing job queued (${json.data.jobId})`);
        setSyncStatus("indexing");

        // Start SSE polling for progress
        const eventSource = new EventSource(
          `/api/projects/${projectId}/sync/progress`
        );

        eventSource.onmessage = (event) => {
          if (cancelled) {
            eventSource.close();
            return;
          }

          const data = JSON.parse(event.data) as SyncStatus;
          setSyncStatus(data.status);

          if (data.status === "indexing") {
            setProgress(data.progress);
            const phaseIdx = phaseIndexFromProgress(data.progress);
            if (data.phase) {
              addLog(`[start] ${data.phase}...`);
            }
            if (phaseIdx > 0 && PHASES[phaseIdx - 1]) {
              addLog(`[done]  ${PHASES[phaseIdx - 1].label} completed`);
            }
          } else if (data.status === "complete") {
            setProgress(100);
            addLog(`[done]  Indexing complete. ${data.nodeCount ?? 0} nodes discovered.`);
            addLog("");
            addLog("Analysis complete. System Map ready.");
            eventSource.close();
            setTimeout(() => {
              if (!cancelled) onComplete();
            }, 800);
          } else if (data.status === "failed" || data.status === "error") {
            setError(data.error ?? "Indexing failed");
            eventSource.close();
          }
        };

        eventSource.onerror = () => {
          if (!cancelled) {
            // SSE connection lost — fall back to polling
            eventSource.close();
            pollFallback();
          }
        };
      } catch {
        if (!cancelled) {
          setError("Failed to connect to server");
        }
      }
    };

    const pollFallback = async () => {
      for (let i = 0; i < 60; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 3000));

        try {
          const res = await fetch(`/api/projects/${projectId}/sync`);
          const json = await res.json();
          if (!json.success) continue;

          if (json.data.isIndexing) {
            setProgress((prev) => Math.min(prev + 5, 90));
            setSyncStatus("indexing");
          } else if (json.data.nodeCount > 0) {
            setProgress(100);
            setSyncStatus("complete");
            addLog(`[done]  Indexing complete. ${json.data.nodeCount} nodes discovered.`);
            addLog("");
            addLog("Analysis complete. System Map ready.");
            setTimeout(() => {
              if (!cancelled) onComplete();
            }, 800);
            return;
          }
        } catch {
          // Continue polling
        }
      }

      if (!cancelled) {
        setError("Indexing timed out. Please try again.");
      }
    };

    startSync();
    return () => { cancelled = true; };
  }, [projectId, repo, onComplete, addLog]);

  const activePhaseIdx = phaseIndexFromProgress(progress);

  const phaseStatuses = PHASES.map((_, idx) => {
    if (idx < activePhaseIdx) return "complete" as const;
    if (idx === activePhaseIdx && syncStatus === "indexing") return "running" as const;
    return "pending" as const;
  });

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Analyzing your codebase
        </h2>
        <p className="text-sm text-muted-foreground">
          Orbit is building a System Map of {repo.fullName}
        </p>
      </div>

      {error && (
        <div className="w-full mb-6 flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="w-full flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-5">
          <ProgressRing progress={progress} />
          <div className="space-y-1">
            {PHASES.map((phase, idx) => (
              <div
                key={phase.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  phaseStatuses[idx] === "running" && "bg-orbit-accent/5"
                )}
              >
                <PhaseIcon status={phaseStatuses[idx]} />
                <span
                  className={cn(
                    "text-sm transition-colors",
                    phaseStatuses[idx] === "complete" && "text-muted-foreground",
                    phaseStatuses[idx] === "running" && "text-foreground font-medium",
                    phaseStatuses[idx] === "pending" && "text-muted-foreground/50"
                  )}
                >
                  {phase.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-lg surface-1 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.04]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Output
            </span>
          </div>
          <ScrollArea className="h-[240px]">
            <div className="p-3 font-mono text-xs space-y-0.5">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-muted-foreground",
                    log.startsWith("[done]") && "text-orbit-pass",
                    log.startsWith("[start]") && "text-orbit-accent",
                    log.includes("complete.") && "text-foreground font-medium mt-2"
                  )}
                >
                  {log || "\u00A0"}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center justify-center">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
          <circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="4"
          />
          <circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke="hsl(var(--orbit-accent))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-foreground tabular-nums">
            {progress}%
          </span>
        </div>
      </div>
    </div>
  );
}
