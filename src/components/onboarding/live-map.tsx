"use client";

import { useEffect, useRef, useState } from "react";
import { LayeredMap } from "@/components/dashboard/layered-map";
import type { MapEdge, MapNode } from "@/components/dashboard/map-types";
import { cn } from "@/lib/utils";

/** Below this the labels stop being words; the panel scrolls instead of shrinking further. */
const MIN_SCALE = 0.4;

interface LiveMapProps {
  nodes: MapNode[];
  edges: MapEdge[];
  /** Nodes slide in and edges draw as they arrive (indexing); off for a finished map. */
  assemble?: boolean;
  className?: string;
}

/**
 * The layered System Map, zoomed to fit its panel: while indexing it zooms out as the map grows,
 * so every new node lands in view. Picking a node traces its path, as on the map page.
 */
export function LiveMap({ nodes, edges, assemble = false, className }: LiveMapProps) {
  const panel = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Measure in the observer callback only: one read per resize, never interleaved with writes.
  useEffect(() => {
    const p = panel.current;
    const m = map.current?.firstElementChild;
    if (!p || !m) return;
    const measure = () => {
      const w = (m as HTMLElement).offsetWidth;
      const h = (m as HTMLElement).offsetHeight;
      if (!w || !h) return;
      const scale = Math.max(MIN_SCALE, Math.min(1, p.clientWidth / w, p.clientHeight / h));
      setFit((prev) => (prev.scale === scale && prev.width === w && prev.height === h ? prev : { scale, width: w, height: h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(p);
    ro.observe(m);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={panel} className={cn("overflow-auto overscroll-contain", className)}>
      <div style={{ width: fit.width * fit.scale || undefined, height: fit.height * fit.scale || undefined }}>
        <div
          ref={map}
          className="origin-top-left transition-transform duration-layout ease-in-out"
          style={{ transform: `scale(${fit.scale})` }}
        >
          <LayeredMap
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mode="journey"
            assemble={assemble}
          />
        </div>
      </div>
    </div>
  );
}
