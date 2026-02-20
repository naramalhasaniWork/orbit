"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Circle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIndexingStream } from "@/hooks/use-indexing-stream";
import type { RepoItem } from "../onboarding-types";
import type { IndexingPhase } from "@/lib/websocket/channels";

const PHASES: Array<{ id: IndexingPhase; label: string }> = [
  { id: "clone", label: "Cloning repository" },
  { id: "framework", label: "Detecting framework" },
  { id: "ast", label: "Parsing AST" },
  { id: "routes", label: "Extracting routes" },
  { id: "components", label: "Mapping components" },
  { id: "embeddings", label: "Generating embeddings" },
];

function phaseToIndex(phase: IndexingPhase | null): number {
  if (!phase) return -1;
  if (phase === "complete") return PHASES.length;
  if (phase === "error") return -1;
  return PHASES.findIndex((p) => p.id === phase);
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
  const [logs, setLogs] = useState<string[]>([]);
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, message]);
  }, []);

  const {
    status: indexingStatus,
    phase,
    progress,
    nodesFound,
  } = useIndexingStream({
    projectId,
    enabled: syncTriggered,
    onNodeDiscovered: (node) => {
      addLog(`[done]  Discovered ${node.nodeType}: ${node.nodeName}`);
    },
    onComplete: () => {
      addLog("");
      addLog("Analysis complete. System Map ready.");
      setTimeout(onComplete, 800);
    },
    onError: (err) => {
      setError(err);
    },
  });

  // Log phase transitions
  useEffect(() => {
    if (!phase) return;
    const phaseConfig = PHASES.find((p) => p.id === phase);
    if (phaseConfig) {
      addLog(`[start] ${phaseConfig.label}...`);
    }
    if (phase === "complete") {
      addLog(`[done]  Indexing complete. ${nodesFound} nodes discovered.`);
    }
  }, [phase, nodesFound, addLog]);

  // Trigger sync on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const triggerSync = async () => {
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
        setSyncTriggered(true);
      } catch {
        setError("Failed to connect to server");
      }
    };

    triggerSync();
  }, [projectId, repo, addLog]);

  const activePhaseIdx = phaseToIndex(phase);

  const phaseStatuses = PHASES.map((_, idx) => {
    if (idx < activePhaseIdx) return "complete" as const;
    if (idx === activePhaseIdx && indexingStatus === "indexing") return "running" as const;
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
            {PHASES.map((p, idx) => (
              <div
                key={p.id}
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
                  {p.label}
                  {phaseStatuses[idx] === "running" && nodesFound > 0 && (
                    <span className="ml-2 text-xs text-orbit-accent tabular-nums">
                      {nodesFound} nodes
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-lg surface-1 border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
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
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const offset = circumference - (clampedProgress / 100) * circumference;

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
          {/* Glow filter */}
          <defs>
            <filter id="progress-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <motion.circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke="hsl(var(--orbit-accent))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            filter="url(#progress-glow)"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-foreground tabular-nums">
            {clampedProgress}%
          </span>
        </div>
      </div>
    </div>
  );
}
