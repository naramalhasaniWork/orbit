"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveMap } from "../live-map";
import type { SystemMapData } from "../onboarding-types";
import type { MapNode } from "@/components/dashboard/map-types";

const STAT_KEYS = [
  { key: "routes" as const, label: "Routes" },
  { key: "components" as const, label: "Components" },
  { key: "endpoints" as const, label: "APIs" },
  { key: "models" as const, label: "Models" },
];

interface MapPreviewProps {
  projectId: string;
  onContinue: () => void;
  onBack: () => void;
}

export function MapPreview({ projectId, onContinue, onBack }: MapPreviewProps) {
  const [data, setData] = useState<SystemMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/system-map`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Failed to load system map");
        return;
      }

      const nodes: MapNode[] = json.data.nodes.map((n: Record<string, unknown>) => ({
        id: n.id as string,
        type: n.type as string,
        name: n.name as string,
        filePath: n.filePath as string | null,
        metadata: n.metadata as Record<string, unknown> | null,
      }));

      setData({
        nodes,
        edges: json.data.edges.map((e: Record<string, unknown>) => ({
          id: e.id as string,
          sourceId: e.sourceNodeId as string,
          targetId: e.targetNodeId as string,
          relationship: e.relationship as string,
        })),
        summary: json.data.summary,
      });
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  if (loading) {
    return (
      <div className="flex flex-col items-center w-full max-w-4xl mx-auto">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="grid grid-cols-4 gap-3 w-full mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="w-full h-[300px] md:h-[380px] rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2 mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error ?? "No system map data found"}
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-balance text-[22px] font-medium tracking-display">
          System Map ready
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">
          {data.summary.totalNodes} nodes and {data.summary.totalEdges} connections. Pick one to trace the journeys through it.
        </p>
      </div>

      <dl className="mb-4 grid w-full grid-cols-4 gap-3">
        {STAT_KEYS.map((stat) => (
          <div key={stat.key} className="flex flex-col gap-1 border-t border-foreground pt-2">
            <dt className="tm-label order-2 text-tm-t3">{stat.label}</dt>
            <dd className="tm-num order-1 text-[22px] leading-none text-foreground sm:text-[28px]">
              {data.summary[stat.key]}
            </dd>
          </div>
        ))}
      </dl>

      <div className="w-full rounded-lg border border-border bg-card">
        <LiveMap nodes={data.nodes} edges={data.edges} className="h-[300px] p-2 md:h-[380px]" />
      </div>

      <div className="flex items-center gap-3 mt-6">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          className="bg-primary hover:bg-primary/85 text-primary-foreground gap-2"
          size="lg"
          onClick={onContinue}
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
