"use client";

import Link from "next/link";
import { useMemo } from "react";
import { LayeredMap } from "@/components/dashboard/layered-map";
import { impactOf } from "@/lib/map/layered";
import type { MapEdge, MapNode } from "./map-types";

/** The layered map is ~1030px wide; at this scale its four columns fit a 320px card. */
const SCALE = 0.3;

/** The System Map at a glance: the impact view, scaled down and static. The whole card opens the full map. */
export function MapPreview({ nodes, edges, projectId }: { nodes: MapNode[]; edges: MapEdge[]; projectId: string }) {
  const { changed, affected } = useMemo(() => {
    const ids = new Set(nodes.filter((n) => n.changeStatus === "added" || n.changeStatus === "modified").map((n) => n.id));
    return { changed: ids.size, affected: ids.size ? impactOf(ids, edges).size - ids.size : 0 };
  }, [nodes, edges]);

  const summary =
    changed === 0
      ? "Nothing changed in the last sync"
      : `${changed} changed in the last sync${affected ? `, ${affected} depending on them` : ""}`;

  return (
    <Link
      href={`/dashboard/map?project=${projectId}&view=impact`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium group-hover:underline">System map</span>
        <span className="tm-num text-[10.5px] text-tm-t3">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </span>
      <span className="mt-0.5 block text-[12px] text-tm-t2">{summary}</span>
      {/* Fixed box: the scaled map never changes the card's height. */}
      <div aria-hidden="true" className="relative mt-3 h-[184px] overflow-hidden rounded-sm border border-border bg-tm-sunken">
        {nodes.length === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-[12px] text-tm-t3">The map appears after the first index.</span>
        ) : (
          <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${SCALE})` }}>
            <LayeredMap nodes={nodes} edges={edges} selectedId={null} mode="impact" />
          </div>
        )}
      </div>
    </Link>
  );
}
