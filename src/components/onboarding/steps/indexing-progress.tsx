"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pending } from "@/components/telemetry/pending";
import { RollingNumber } from "@/components/telemetry/rolling-number";
import { cn } from "@/lib/utils";
import { useIndexingStream } from "@/hooks/use-indexing-stream";
import { useMapAssembly } from "@/hooks/use-map-assembly";
import { LiveMap } from "../live-map";
import type { RepoItem } from "../onboarding-types";
import type { IndexingPhase } from "@/lib/websocket/channels";
import type { AssemblyCounts } from "@/lib/onboarding/map-assembly";

const PHASES: Array<{ id: IndexingPhase; label: string }> = [
  { id: "clone", label: "Clone" },
  { id: "framework", label: "Framework" },
  { id: "ast", label: "Parse" },
  { id: "routes", label: "Routes" },
  { id: "components", label: "Components" },
  { id: "embeddings", label: "Embeddings" },
];

const COUNTERS: Array<{ key: keyof AssemblyCounts; label: string }> = [
  { key: "routes", label: "Routes" },
  { key: "components", label: "Components" },
  { key: "apis", label: "APIs" },
  { key: "models", label: "Models" },
];

/** Long enough to see the finished map settle, short enough not to feel like a wait. */
const COMPLETE_HOLD_MS = 1200;

function phaseIndex(phase: IndexingPhase | null): number {
  if (phase === "complete") return PHASES.length;
  return phase ? PHASES.findIndex((p) => p.id === phase) : -1;
}

interface IndexingProgressProps {
  repo: RepoItem;
  projectId: string;
  onComplete: () => void;
}

/** Step 2: the System Map assembles live from the indexing stream, node by node, then edge by edge. */
export function IndexingProgress({ repo, projectId, onComplete }: IndexingProgressProps) {
  const router = useRouter();
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const { assembly, push } = useMapAssembly();

  const { status, phase, progress } = useIndexingStream({
    projectId,
    enabled: syncTriggered,
    onEvent: push,
    onComplete: () => setTimeout(onComplete, COMPLETE_HOLD_MS),
    onError: setError,
  });

  // Trigger the sync on mount, or attach to one already running.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const statusRes = await fetch(`/api/projects/${projectId}/sync`);
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          if (statusJson.data?.isIndexing) {
            setSyncTriggered(true);
            return;
          }
          if (statusJson.data?.lastIndexedAt && statusJson.data?.nodeCount > 0) {
            setTimeout(onComplete, 500);
            return;
          }
        }
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
        setSyncTriggered(true);
      } catch {
        setError("Failed to connect to server");
      }
    })();
  }, [projectId, repo, onComplete]);

  const done = status === "complete";
  const active = phaseIndex(phase);
  const pct = Math.max(0, Math.min(100, progress));
  const phaseLabel = done ? "Map ready" : PHASES[active]?.label ?? "Queued";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-balance text-[22px] font-medium tracking-display">
          {done ? "System Map ready" : `Reading ${repo.fullName}`}
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Every route, component, API and data model Orbit finds lands on the map as it finds it.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-tm-fail/30 bg-tm-fail-bg px-3 py-2 text-[13px] text-tm-fail">
          <span aria-hidden="true">✕</span>
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>Retry</Button>
        </p>
      )}

      <dl className="mb-4 grid grid-cols-4 gap-3">
        {COUNTERS.map((c) => (
          <div key={c.key} className="flex flex-col gap-1 border-t border-foreground pt-2">
            <dt className="tm-label order-2 text-tm-t3">{c.label}</dt>
            <dd className="tm-num order-1 text-[22px] leading-none text-foreground sm:text-[28px]">
              <RollingNumber value={assembly.counts[c.key]} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-3 flex items-center gap-3">
        <span className="tm-label w-24 shrink-0 text-tm-t2" aria-live="polite">{phaseLabel}</span>
        <div className="relative h-px flex-1 overflow-hidden bg-border" aria-hidden="true">
          <div
            className="absolute inset-0 origin-left bg-foreground transition-transform duration-change ease-out"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <span className="tm-num w-10 shrink-0 text-right text-[11px] text-tm-t2">{pct}%</span>
      </div>

      <div className="relative rounded-lg border border-border bg-card">
        {assembly.nodes.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center md:h-[360px]">
            <Pending label={status === "idle" || status === "connecting" ? "Starting the indexer" : "Looking for the first route"} showLabel />
          </div>
        ) : (
          <LiveMap nodes={assembly.nodes} edges={assembly.edges} assemble className="h-[280px] p-2 md:h-[360px]" />
        )}
      </div>

      <ol className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1" aria-label="Indexing phases">
        {PHASES.map((p, i) => {
          const state = i < active ? "done" : i === active && status === "indexing" ? "running" : "pending";
          return (
            <li
              key={p.id}
              className={cn(
                "tm-label flex items-center gap-1.5",
                state === "done" && "text-tm-t2",
                state === "running" && "text-foreground",
                state === "pending" && "text-tm-t3"
              )}
            >
              <span aria-hidden="true">{state === "done" ? "✓" : state === "running" ? "●" : "○"}</span>
              {p.label}
              <span className="sr-only">{state === "done" ? ", done" : state === "running" ? ", running" : ", pending"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
