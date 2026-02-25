"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  type OperationsFlowProps,
  type OperationGraphNode,
  type OperationGraphLink,
  type OperationType,
  OPERATION_TYPE_COLORS,
  OPERATION_TYPE_LABELS,
  ACCENT_COLOR,
} from "./operations-flow-types";
import { OperationsControls } from "./operations-flow-controls";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

export function OperationsFlow({
  operations,
  flows,
  dependencies,
  compact = false,
}: OperationsFlowProps) {
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<OperationType>>(
    () => new Set(Object.keys(OPERATION_TYPE_COLORS) as OperationType[])
  );

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Auto-fit on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 40);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Build dependency lookup: operationId -> dependsOn[]
  const depMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dep of dependencies) {
      map.set(dep.operationId, dep.dependsOn);
    }
    return map;
  }, [dependencies]);

  // Map operation -> flow for critical path detection
  const operationFlowMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const flow of flows) {
      for (const opId of flow.operations) {
        map.set(opId, flow.id);
      }
    }
    return map;
  }, [flows]);

  const criticalOpIds = useMemo(() => {
    const ids = new Set<string>();
    for (const flow of flows) {
      if (flow.criticalPath) {
        for (const opId of flow.operations) {
          ids.add(opId);
        }
      }
    }
    return ids;
  }, [flows]);

  // Filter & build graph data
  const graphData = useMemo(() => {
    const filtered = operations.filter((op) => activeTypes.has(op.type));
    const filteredIds = new Set(filtered.map((op) => op.id));

    const nodes: OperationGraphNode[] = filtered.map((op) => ({
      ...op,
      flowId: operationFlowMap.get(op.id),
    }));

    const links: OperationGraphLink[] = [];
    for (const op of filtered) {
      const deps = depMap.get(op.id) ?? [];
      for (const depId of deps) {
        if (filteredIds.has(depId)) {
          links.push({
            source: depId,
            target: op.id,
            id: `${depId}->${op.id}`,
          });
        }
      }
    }

    return { nodes, links };
  }, [operations, activeTypes, depMap, operationFlowMap]);

  const selectedOp = useMemo(
    () => operations.find((op) => op.id === selectedNodeId) ?? null,
    [operations, selectedNodeId]
  );

  const selectedFlow = useMemo(() => {
    if (!selectedNodeId) return null;
    const flowId = operationFlowMap.get(selectedNodeId);
    return flows.find((f) => f.id === flowId) ?? null;
  }, [selectedNodeId, operationFlowMap, flows]);

  // Handlers
  const handleNodeClick = useCallback((node: any) => {
    const gn = node as OperationGraphNode;
    setSelectedNodeId((prev) => (prev === gn.id ? null : gn.id));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleToggleType = useCallback((type: OperationType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Canvas rendering
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gn = node as OperationGraphNode;
      const x = gn.x ?? 0;
      const y = gn.y ?? 0;
      const color = OPERATION_TYPE_COLORS[gn.type] ?? "#6b7280";
      const isCritical = criticalOpIds.has(gn.id);
      const isSelected = gn.id === selectedNodeId;
      const size = compact ? 5 : 7;

      // Critical path glow
      if (isCritical) {
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `${ACCENT_COLOR}22`;
        ctx.fill();
        ctx.strokeStyle = `${ACCENT_COLOR}66`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Selected ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = ACCENT_COLOR;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label (only when zoomed in enough)
      if (globalScale > 0.6 && !compact) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(232, 236, 242, 0.85)";
        ctx.font = `${Math.max(10 / globalScale, 3)}px Inter, sans-serif`;
        ctx.fillText(gn.name, x, y + size + 3);
      }
    },
    [selectedNodeId, criticalOpIds, compact]
  );

  const nodePointerArea = useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const gn = node as OperationGraphNode;
      const x = gn.x ?? 0;
      const y = gn.y ?? 0;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const linkColor = useCallback(
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedNodeId && (src === selectedNodeId || tgt === selectedNodeId)) {
        return `${ACCENT_COLOR}99`;
      }
      // Highlight critical path links
      if (criticalOpIds.has(src) && criticalOpIds.has(tgt)) {
        return `${ACCENT_COLOR}44`;
      }
      return "rgba(255, 255, 255, 0.06)";
    },
    [selectedNodeId, criticalOpIds]
  );

  const linkWidth = useCallback(
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedNodeId && (src === selectedNodeId || tgt === selectedNodeId)) return 2;
      if (criticalOpIds.has(src) && criticalOpIds.has(tgt)) return 1.5;
      return 0.5;
    },
    [selectedNodeId, criticalOpIds]
  );

  const nodeLabel = useCallback((node: any) => {
    const gn = node as OperationGraphNode;
    return `<div style="background:#141726;color:#e8ecf2;padding:6px 10px;border-radius:6px;font-size:11px;border:1px solid rgba(255,255,255,0.08)"><strong>${gn.name}</strong><br/><span style="opacity:0.6">${OPERATION_TYPE_LABELS[gn.type]}</span></div>`;
  }, []);

  return (
    <div className="flex h-full w-full">
      {!compact && (
        <OperationsControls
          activeTypes={activeTypes}
          onToggleType={handleToggleType}
          flows={flows}
          selectedOp={selectedOp}
          selectedFlow={selectedFlow}
        />
      )}

      <div ref={containerRef} className="flex-1 relative bg-[#0d0f1a] rounded-lg overflow-hidden border border-border">
        {graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No operations match current filters
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="#0d0f1a"
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => "replace"}
            nodePointerAreaPaint={nodePointerArea}
            nodeLabel={nodeLabel}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.9}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.3}
            warmupTicks={50}
            cooldownTicks={100}
            enableNodeDrag={!compact}
            linkSource="source"
            linkTarget="target"
          />
        )}
      </div>
    </div>
  );
}
