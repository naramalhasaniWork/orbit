"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { MapControls } from "./map-controls";
import { MapNodeDetail } from "./map-node-detail";
import {
  type MapNode,
  type MapEdge,
  type TestStatus,
  NODE_TYPE_CONFIG,
  ACCENT_COLOR,
} from "./map-types";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
});

interface GraphNode3D extends MapNode {
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLink3D {
  source: string | GraphNode3D;
  target: string | GraphNode3D;
  relationship: string;
  id: string;
}

const TYPE_HEX: Record<string, number> = {
  route: 0x6366f1,
  component: 0x0ea5e9,
  endpoint: 0x10b981,
  model: 0xa855f7,
  auth_strategy: 0xff6000,
  middleware: 0xf59e0b,
  utility: 0x6b7280,
};

const STATUS_HEX: Record<string, number> = {
  pass: 0x22c55e,
  fail: 0xef4444,
  flaky: 0xf59e0b,
  untested: 0x2d3748,
};

function resolveNodeColor(node: MapNode): number {
  if (node.testStatus && node.testStatus !== "untested") {
    return STATUS_HEX[node.testStatus] ?? STATUS_HEX.untested;
  }
  return TYPE_HEX[node.type] ?? 0x6b7280;
}

function resolveNodeRadius(node: MapNode): number {
  return (NODE_TYPE_CONFIG[node.type]?.size ?? 5) * 0.45;
}

interface SystemMap3DProps {
  nodes: MapNode[];
  edges: MapEdge[];
}

export function SystemMap3D({ nodes, edges }: SystemMap3DProps) {
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

  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(600, 80);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

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

  const graphData = useMemo(() => {
    const graphNodes: GraphNode3D[] = filteredNodes.map((n) => ({ ...n }));
    const graphLinks: GraphLink3D[] = edges
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

  const nodeThreeObject = useCallback(
    (node: any) => {
      const n = node as GraphNode3D;
      const isSelected = n.id === selectedNodeId;
      const radius = resolveNodeRadius(n) * (isSelected ? 1.6 : 1);
      const color = resolveNodeColor(n);

      const group = new THREE.Group();

      // Core sphere
      const geo = new THREE.SphereGeometry(radius, 20, 20);
      const mat = new THREE.MeshLambertMaterial({
        color,
        emissive: isSelected ? new THREE.Color(ACCENT_COLOR) : new THREE.Color(color),
        emissiveIntensity: isSelected ? 0.5 : 0.12,
        transparent: true,
        opacity: isSelected ? 1 : 0.9,
      });
      group.add(new THREE.Mesh(geo, mat));

      // Glow halo for selected
      if (isSelected) {
        const haloGeo = new THREE.SphereGeometry(radius * 1.8, 16, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(ACCENT_COLOR),
          transparent: true,
          opacity: 0.08,
          side: THREE.BackSide,
        });
        group.add(new THREE.Mesh(haloGeo, haloMat));
      }

      // Change status ring
      if (n.changeStatus === "added" || n.changeStatus === "modified") {
        const ringColor = n.changeStatus === "added" ? 0x3b82f6 : 0xa855f7;
        const ringGeo = new THREE.TorusGeometry(radius * 1.5, 0.4, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.85,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      return group;
    },
    [selectedNodeId]
  );

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handleBackgroundClick = useCallback(() => setSelectedNodeId(null), []);

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
    const graph = graphRef.current;
    if (!graph) return;
    const cam = graph.camera();
    graph.cameraPosition(
      { x: cam.position.x * 0.65, y: cam.position.y * 0.65, z: cam.position.z * 0.65 },
      undefined,
      300
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const cam = graph.camera();
    graph.cameraPosition(
      { x: cam.position.x * 1.5, y: cam.position.y * 1.5, z: cam.position.z * 1.5 },
      undefined,
      300
    );
  }, []);

  const handleZoomFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 80);
  }, []);

  const linkColor = useCallback(
    (link: any) => {
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedNodeId && (src === selectedNodeId || tgt === selectedNodeId)) {
        return "rgba(255, 96, 0, 0.85)";
      }
      return "rgba(255, 255, 255, 0.08)";
    },
    [selectedNodeId]
  );

  const nodeLabel = useCallback((node: any) => {
    const n = node as GraphNode3D;
    return `<div style="background:#141726;color:#e8ecf2;padding:6px 10px;border-radius:6px;font-size:11px;border:1px solid rgba(255,255,255,0.08);pointer-events:none"><strong>${n.name}</strong><br/><span style="opacity:0.6">${n.type}${n.filePath ? ` · ${n.filePath}` : ""}</span></div>`;
  }, []);

  return (
    <div className="flex h-full w-full">
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

      <div ref={containerRef} className="flex-1 relative rounded-lg overflow-hidden">
        {graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No nodes match current filters
          </div>
        ) : (
          <ForceGraph3D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="#0d0f1a"
            nodeThreeObject={nodeThreeObject}
            nodeThreeObjectExtend={false}
            nodeLabel={nodeLabel}
            linkColor={linkColor}
            linkWidth={0.6}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => "rgba(255,255,255,0.25)"}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.2}
            linkDirectionalParticleColor={linkColor}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            enableNavigationControls
          />
        )}
      </div>

      {selectedNode && (
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
