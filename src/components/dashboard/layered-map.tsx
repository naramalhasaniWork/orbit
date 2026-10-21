"use client";

import { useMemo } from "react";
import { LAYERS, connectedPath, impactOf, layoutLayers } from "@/lib/map/layered";
import { STATUS_TONES } from "@/lib/status-tone";
import { cn } from "@/lib/utils";
import type { MapEdge, MapNode } from "./map-types";

const COL_W = 184;
const GAP = 88;
const ROW_H = 36;
const NODE_H = 26;
const PAD_X = 16;
const PAD_TOP = 40;

/** Border style encodes node type: route solid, component dashed, API double, data filled. */
const TYPE_STYLE: Record<number, string> = {
  0: "border border-tm-line-strong bg-card",
  1: "border border-dashed border-tm-line-strong bg-card",
  2: "border-[3px] border-double border-tm-line-strong bg-card",
  3: "border border-transparent bg-tm-sunken",
};

interface LayeredMapProps {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** "impact": highlight what changed since the last sync and everything depending on it. */
  mode: "journey" | "impact";
  /** Onboarding: nodes slide in and edges draw as indexing discovers them; reflows glide. */
  assemble?: boolean;
}

/** The layered map: routes → components → APIs → data, left to right. */
export function LayeredMap({ nodes, edges, selectedId, onSelect, mode, assemble = false }: LayeredMapProps) {
  const layout = useMemo(() => layoutLayers(nodes, edges), [nodes, edges]);
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number; layer: number }>();
    for (const p of layout.placed) m.set(p.node.id, { x: PAD_X + p.layer * (COL_W + GAP), y: PAD_TOP + p.row * ROW_H, layer: p.layer });
    return m;
  }, [layout]);

  const highlight = useMemo(() => {
    if (mode === "impact") {
      const changed = new Set(nodes.filter((n) => n.changeStatus === "added" || n.changeStatus === "modified").map((n) => n.id));
      return changed.size ? impactOf(changed, edges) : null;
    }
    return selectedId ? connectedPath(selectedId, edges) : null;
  }, [mode, nodes, edges, selectedId]);

  const width = PAD_X * 2 + LAYERS.length * COL_W + (LAYERS.length - 1) * GAP;
  const height = PAD_TOP + layout.rows * ROW_H + 16;
  const lit = (id: string) => !highlight || highlight.has(id);

  return (
    <div className="relative" style={{ width, height }}>
      {LAYERS.map((l, i) => (
        <span key={l.id} className="tm-label absolute top-3 text-tm-t3" style={{ left: PAD_X + i * (COL_W + GAP) }}>
          {String(i + 1).padStart(2, "0")} · {l.label}
        </span>
      ))}

      <svg aria-hidden="true" width={width} height={height} className="absolute inset-0">
        {edges.map((e) => {
          const a = pos.get(e.sourceId);
          const b = pos.get(e.targetId);
          if (!a || !b) return null;
          const forward = a.layer <= b.layer;
          const x1 = forward ? a.x + COL_W : a.x;
          const x2 = forward ? b.x : b.x + COL_W;
          const y1 = a.y + NODE_H / 2;
          const y2 = b.y + NODE_H / 2;
          // Spread each source's vertical run across the gap so parallel edges stay readable.
          const lane = ((Math.round(a.y / ROW_H) % 7) - 3) * 8;
          const mid = a.layer === b.layer ? x1 + 16 : (x1 + x2) / 2 + lane;
          const on = !!highlight && highlight.has(e.sourceId) && highlight.has(e.targetId);
          return (
            <path
              key={e.id}
              d={`M${x1} ${y1} H${mid} V${y2} H${x2}`}
              fill="none"
              className={cn(
                on ? (mode === "impact" ? "stroke-foreground" : "stroke-tm-live") : "stroke-tm-line-strong",
                highlight && !on && "opacity-30",
                assemble && "animate-[tm-edge-draw_280ms_var(--ease-out)_both] [transform-box:fill-box]"
              )}
              style={assemble ? { transformOrigin: forward ? "left center" : "right center" } : undefined}
              strokeWidth={on ? 1.5 : 1}
            />
          );
        })}
      </svg>

      {layout.placed.map(({ node, layer }) => {
        const p = pos.get(node.id);
        if (!p) return null;
        const tone = STATUS_TONES[node.testStatus ?? "untested"];
        const isSelected = node.id === selectedId;
        const changed = node.changeStatus === "added" || node.changeStatus === "modified";
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(isSelected ? null : node.id)}
            aria-pressed={isSelected}
            aria-label={`${node.name}, ${node.type}, ${tone.label}${changed ? `, ${node.changeStatus}` : ""}`}
            title={node.filePath ?? node.name}
            className={cn(
              "absolute left-0 top-0 flex items-center gap-2 rounded-sm px-2 text-left text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              assemble
                ? "animate-[tm-node-in_240ms_var(--ease-out)_both] transition-transform duration-layout ease-in-out"
                : "transition-opacity duration-change",
              TYPE_STYLE[layer],
              isSelected && "outline outline-1 outline-offset-2 outline-tm-live",
              highlight && !lit(node.id) && "opacity-35"
            )}
            style={{ transform: `translate(${p.x}px, ${p.y}px)`, width: COL_W, height: NODE_H }}
          >
            <span aria-hidden="true" className={cn("size-1 shrink-0", tone.fill, tone.square ? "rounded-[1px]" : "rounded-full")} />
            <span className={cn("min-w-0 flex-1 truncate", highlight && !lit(node.id) ? "text-tm-t3" : "text-foreground")}>{node.name}</span>
            {changed && <span className="tm-label shrink-0 text-tm-t3">{node.changeStatus === "added" ? "New" : "Chg"}</span>}
          </button>
        );
      })}

      {layout.collapsed.map((n, i) =>
        n > 0 ? (
          <span
            key={i}
            className="tm-label absolute flex items-center px-2 text-tm-t3"
            style={{ left: PAD_X + i * (COL_W + GAP), top: PAD_TOP + Math.min(layout.placed.filter((p) => p.layer === i).length, layout.rows) * ROW_H, height: NODE_H }}
          >
            +{n} more
          </span>
        ) : null
      )}
    </div>
  );
}
