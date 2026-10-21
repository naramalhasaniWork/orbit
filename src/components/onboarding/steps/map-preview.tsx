"use client";

import { useState, useEffect, useCallback } from "react";
import { Route, Component, Server, Database, ChevronRight, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SystemMapData } from "../onboarding-types";
import type { MapNode } from "@/components/dashboard/map-types";

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Route; color: string }
> = {
  route: { label: "Routes", icon: Route, color: "text-foreground" },
  component: { label: "Components", icon: Component, color: "text-orbit-pass" },
  endpoint: { label: "API Endpoints", icon: Server, color: "text-orbit-flaky" },
  model: { label: "Data Models", icon: Database, color: "text-tm-t2" },
};

const STAT_KEYS = [
  { key: "routes" as const, label: "Routes", color: "text-foreground" },
  { key: "components" as const, label: "Components", color: "text-orbit-pass" },
  { key: "endpoints" as const, label: "Endpoints", color: "text-orbit-flaky" },
  { key: "models" as const, label: "Models", color: "text-tm-t2" },
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
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="grid grid-cols-4 gap-3 w-full mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="w-full h-[280px] rounded-lg" />
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

  const grouped = data.nodes.reduce<Record<string, MapNode[]>>((acc, node) => {
    if (!acc[node.type]) acc[node.type] = [];
    acc[node.type].push(node);
    return acc;
  }, {});

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="mb-2 text-balance text-[22px] font-medium tracking-display">
          System Map ready
        </h2>
        <p className="text-sm text-muted-foreground">
          Here is what Orbit discovered in your codebase.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 w-full mb-6">
        {STAT_KEYS.map((stat) => (
          <div
            key={stat.key}
            className="flex flex-col items-center border-t border-foreground px-3 py-3"
          >
            <span className={cn("text-2xl font-medium tabular-nums", stat.color)}>
              {data.summary[stat.key]}
            </span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      <ScrollArea className="w-full h-[280px] rounded-lg surface-1">
        <div className="p-4 space-y-5">
          {(["route", "component", "endpoint", "model"] as const).map((type) => {
            const config = TYPE_CONFIG[type];
            if (!config) return null;
            const items = grouped[type] ?? [];
            const Icon = config.icon;

            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn("h-4 w-4", config.color)} />
                  <span className=" tm-label text-muted-foreground">
                    {config.label}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {items.length}
                  </Badge>
                </div>
                <div className="grid gap-1">
                  {items.slice(0, 20).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-1.5 rounded text-sm hover:bg-muted/30 transition-colors"
                    >
                      <span className="font-mono text-foreground">{item.name}</span>
                      <span className="text-xs text-muted-foreground/60 truncate ml-auto">
                        {item.filePath}
                      </span>
                    </div>
                  ))}
                  {items.length > 20 && (
                    <div className="px-3 py-1 text-xs text-muted-foreground">
                      +{items.length - 20} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

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
