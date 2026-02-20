"use client";

import { useEffect, useRef, useCallback } from "react";

interface MapNode {
  x: number;
  y: number;
  radius: number;
  color: string;
  glowColor: string;
  phase: number;
  speed: number;
  type: "circle" | "diamond" | "hex";
}

interface MapEdge {
  from: number;
  to: number;
  progress: number;
  speed: number;
}

/* Colors derived from Orbit brand tokens:
   primary/accent (24 100% 50%), orbit-pass (160 84% 39%),
   orbit-info (199 89% 48%), warm amber (30 90% 60%) */
const NODE_COLORS = [
  { fill: "hsl(24, 100%, 50%)", glow: "hsla(24, 100%, 50%, 0.35)" },
  { fill: "hsl(160, 84%, 39%)", glow: "hsla(160, 84%, 39%, 0.3)" },
  { fill: "hsl(199, 89%, 48%)", glow: "hsla(199, 89%, 48%, 0.3)" },
  { fill: "hsl(30, 90%, 60%)", glow: "hsla(30, 90%, 60%, 0.25)" },
  { fill: "hsl(24, 100%, 65%)", glow: "hsla(24, 100%, 65%, 0.3)" },
];

function createNodes(width: number, height: number): MapNode[] {
  const nodes: MapNode[] = [];
  const count = 28;
  const padding = 60;

  for (let i = 0; i < count; i++) {
    const colorSet = NODE_COLORS[i % NODE_COLORS.length];
    const types: Array<"circle" | "diamond" | "hex"> = [
      "circle",
      "diamond",
      "hex",
    ];
    nodes.push({
      x: padding + Math.random() * (width - padding * 2),
      y: padding + Math.random() * (height - padding * 2),
      radius: 3 + Math.random() * 4,
      color: colorSet.fill,
      glowColor: colorSet.glow,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7,
      type: types[i % 3],
    });
  }
  return nodes;
}

function createEdges(nodeCount: number): MapEdge[] {
  const edges: MapEdge[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const connections = 1 + Math.floor(Math.random() * 2);
    for (let j = 0; j < connections; j++) {
      const target = Math.floor(Math.random() * nodeCount);
      if (target !== i) {
        edges.push({
          from: i,
          to: target,
          progress: Math.random(),
          speed: 0.001 + Math.random() * 0.003,
        });
      }
    }
  }
  return edges;
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: MapNode,
  pulse: number
) {
  const r = node.radius * (0.9 + pulse * 0.1);

  ctx.shadowColor = node.glowColor;
  ctx.shadowBlur = 12 + pulse * 6;

  ctx.fillStyle = node.color;
  ctx.globalAlpha = 0.6 + pulse * 0.4;

  if (node.type === "circle") {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (node.type === "diamond") {
    const s = r * 1.3;
    ctx.beginPath();
    ctx.moveTo(node.x, node.y - s);
    ctx.lineTo(node.x + s, node.y);
    ctx.lineTo(node.x, node.y + s);
    ctx.lineTo(node.x - s, node.y);
    ctx.closePath();
    ctx.fill();
  } else {
    const s = r * 1.1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = node.x + s * Math.cos(angle);
      const py = node.y + s * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

export function AnimatedSystemMap({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<MapNode[]>([]);
  const edgesRef = useRef<MapEdge[]>([]);
  const animFrameRef = useRef<number>(0);

  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    // Draw edges
    for (const edge of edges) {
      const from = nodes[edge.from];
      const to = nodes[edge.to];
      if (!from || !to) continue;

      edge.progress = (edge.progress + edge.speed) % 1;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = "hsla(24, 100%, 50%, 0.1)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Traveling dot along edge
      const dotX = from.x + (to.x - from.x) * edge.progress;
      const dotY = from.y + (to.y - from.y) * edge.progress;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "hsla(24, 100%, 50%, 0.5)";
      ctx.fill();
    }

    // Draw nodes
    for (const node of nodes) {
      const pulse =
        (Math.sin(time * 0.001 * node.speed + node.phase) + 1) / 2;
      drawNode(ctx, node, pulse);
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);

      nodesRef.current = createNodes(rect.width, rect.height);
      edgesRef.current = createEdges(nodesRef.current.length);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [animate]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      />
    </div>
  );
}
