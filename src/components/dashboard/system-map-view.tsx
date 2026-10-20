"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useUrlParams, useUrlSelection } from "@/hooks/use-url-state";
import { LayeredMap } from "@/components/dashboard/layered-map";
import { MapNodeDetail } from "@/components/dashboard/map-node-detail";
import { Pending } from "@/components/telemetry/pending";
import { cn } from "@/lib/utils";
import type { MapEdge, MapNode } from "./map-types";

// The 3D view stays available, loaded only when asked for.
const SystemMap3D = dynamic(() => import("@/components/dashboard/system-map-3d").then((m) => m.SystemMap3D), {
  ssr: false,
  loading: () => <Pending label="Loading 3D view" showLabel className="m-4" />,
});

const VIEW_DEFAULTS = { view: "layers" };
const VIEWS = [
  { id: "layers", label: "Journeys" },
  { id: "impact", label: "Changes since last sync" },
  { id: "3d", label: "3D" },
] as const;

/** System Map: the layered map by default, the change impact view, and the 3D view on request. */
export function SystemMapView({ nodes, edges }: { nodes: MapNode[]; edges: MapEdge[] }) {
  const [{ view }, setParams] = useUrlParams(VIEW_DEFAULTS);
  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const [selectedId, select] = useUrlSelection("node", nodeIds);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const changedCount = nodes.filter((n) => n.changeStatus === "added" || n.changeStatus === "modified").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div role="tablist" aria-label="Map view" className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setParams({ view: v.id })}
            className={cn(
              "-mb-px h-10 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-tm-t2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              view === v.id && "border-foreground text-foreground"
            )}
          >
            {v.label}
            {v.id === "impact" && <span className="tm-num ml-1.5 text-[10.5px] text-tm-t3">{changedCount}</span>}
          </button>
        ))}
        {view !== "3d" && (
          <span className="tm-label ml-auto hidden text-tm-t3 md:block">
            Solid route · dashed component · double API · filled data
          </span>
        )}
      </div>

      {view === "3d" ? (
        <div className="min-h-0 flex-1">
          <SystemMap3D nodes={nodes} edges={edges} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">
            {view === "impact" && changedCount === 0 ? (
              <p className="p-5 text-[13px] text-tm-t3">Nothing changed in the last sync.</p>
            ) : (
              <LayeredMap
                nodes={nodes}
                edges={edges}
                selectedId={selectedId}
                onSelect={select}
                mode={view === "impact" ? "impact" : "journey"}
              />
            )}
          </div>
          {selected && (
            <MapNodeDetail
              node={selected}
              edges={edges}
              allNodes={nodes}
              onClose={() => select(null)}
              onSelectNode={(id) => select(id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
