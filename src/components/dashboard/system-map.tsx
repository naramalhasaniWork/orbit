"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  renderNode,
  renderSelectedRing,
  paintNodePointerArea,
} from "./map-canvas-renderer";
import { MapControls } from "./map-controls";
import { MapNodeDetail } from "./map-node-detail";
import {
  type GraphNode,
  type GraphLink,
  type MapNode,
  type MapEdge,
  type TestStatus,
  NODE_TYPE_CONFIG,
} from "./map-types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface SystemMapProps {
  nodes: MapNode[];
  edges: MapEdge[];
  compact?: boolean;
}

export function SystemMap({ nodes, edges, compact = false }: SystemMapProps) {

  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(Object.keys(NODE_TYPE_CONFIG))
  );
  const [activeStatuses, setActiveStatuses] = useState(
    () => new Set<TestStatus>(["pass", "fail", "flaky", "untested"])
  );
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (!activeTypes.has(node.type)) return false;
      if (!activeStatuses.has(node.testStatus ?? "untested")) return false;
      if (searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [nodes, activeTypes, activeStatuses, searchQuery]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  // Build graph data
  const graphData = useMemo(() => {
    const graphNodes: GraphNode[] = filteredNodes.map((n) => ({ ...n }));
    const graphLinks: GraphLink[] = edges
      .filter((e) => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId))
      .map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        relationship: e.relationship,
        id: e.id,
      }));
    return { nodes: graphNodes, links: graphLinks };
  }, [filteredNodes, filteredNodeIds, edges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // Handlers
  const handleNodeClick = useCallback(
  
    (node: any) => {
      const gn = node as GraphNode;
      setSelectedNodeId((prev) => (prev === gn.id ? null : gn.id));
    },
    []
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleToggleType = useCallback((type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleToggleStatus = useCallback((status: TestStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    const current = graphRef.current?.zoom() ?? 1;
    graphRef.current?.zoom(current * 1.4, 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    const current = graphRef.current?.zoom() ?? 1;
    graphRef.current?.zoom(current / 1.4, 300);
  }, []);

  const handleZoomFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  // Canvas render callbacks — use `any` at the boundary with the library
  const nodeCanvasObject = useCallback(
  
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gn = node as GraphNode;
      renderNode(gn, ctx, globalScale);
      if (gn.id === selectedNodeId) {
        renderSelectedRing(gn, ctx);
      }
    },
    [selectedNodeId]
  );


  const nodePointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    paintNodePointerArea(node as GraphNode, color, ctx);
  }, []);

  const linkColor = useCallback(
  
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedNodeId && (src === selectedNodeId || tgt === selectedNodeId)) {
        return "rgba(139, 92, 246, 0.6)";
      }
      return "rgba(255, 255, 255, 0.1)";
    },
    [selectedNodeId]
  );

  const linkWidth = useCallback(
  
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedNodeId && (src === selectedNodeId || tgt === selectedNodeId)) {
        return 1.5;
      }
      return 0.5;
    },
    [selectedNodeId]
  );


  const nodeLabel = useCallback((node: any) => {
    const gn = node as GraphNode;
    return `<div style="background:#13122a;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-size:11px"><strong>${gn.name}</strong><br/><span style="opacity:0.6">${gn.type}${gn.filePath ? ` -- ${gn.filePath}` : ""}</span></div>`;
  }, []);

  // Grid background render
  const renderBackground = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (globalScale < 0.5) return;
      const spacing = 40;
      const dotSize = 0.5 / globalScale;
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";

      const bbox = graphRef.current?.getGraphBbox() ?? { x: [-500, 500] as [number, number], y: [-500, 500] as [number, number] };
      const [minX, maxX] = bbox.x;
      const [minY, maxY] = bbox.y;

      const startX = Math.floor(minX / spacing) * spacing - spacing;
      const startY = Math.floor(minY / spacing) * spacing - spacing;

      for (let gx = startX; gx <= maxX + spacing; gx += spacing) {
        for (let gy = startY; gy <= maxY + spacing; gy += spacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, dotSize, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    },
    []
  );

  return (
    <div className="flex h-full w-full">
      {!compact && (
        <div className="w-56 shrink-0 p-3 overflow-y-auto">
          <MapControls
            activeTypes={activeTypes}
            activeStatuses={activeStatuses}
            searchQuery={searchQuery}
            onToggleType={handleToggleType}
            onToggleStatus={handleToggleStatus}
            onSearchChange={setSearchQuery}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomFit={handleZoomFit}
          />
        </div>
      )}

      <div ref={containerRef} className="flex-1 relative bg-[#0b0a13] rounded-lg overflow-hidden">
        {graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No nodes match current filters
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="#0b0a13"
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => "replace"}
            nodePointerAreaPaint={nodePointerArea}
            nodeLabel={nodeLabel}
            linkColor={linkColor}
            linkWidth={linkWidth}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.3}
            warmupTicks={50}
            cooldownTicks={100}
            enableNodeDrag={!compact}
            onRenderFramePre={renderBackground}
            linkSource="source"
            linkTarget="target"
          />
        )}
      </div>

      {!compact && selectedNode && (
        <MapNodeDetail
          node={selectedNode}
          edges={edges}
          allNodes={nodes}
          onClose={() => setSelectedNodeId(null)}
          onSelectNode={(id) => setSelectedNodeId(id)}
        />
      )}
    </div>
  );
}
