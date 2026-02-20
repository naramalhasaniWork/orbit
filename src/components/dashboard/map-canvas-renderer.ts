// Canvas rendering functions for System Map node shapes

import {
  type GraphNode,
  type TestStatus,
  NODE_TYPE_CONFIG,
  STATUS_CONFIG,
  ACCENT_COLOR,
} from "./map-types";

function getNodeColor(status: TestStatus | undefined): string {
  return STATUS_CONFIG[status ?? "untested"].color;
}

function getNodeSize(type: string): number {
  return NODE_TYPE_CONFIG[type]?.size ?? 5;
}

/** Draw a circle (route nodes) */
function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a rounded rectangle (component nodes) */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const w = size * 2.2;
  const h = size * 1.6;
  const r = size * 0.35;
  const left = x - w / 2;
  const top = y - h / 2;

  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + w - r, top);
  ctx.quadraticCurveTo(left + w, top, left + w, top + r);
  ctx.lineTo(left + w, top + h - r);
  ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
  ctx.lineTo(left + r, top + h);
  ctx.quadraticCurveTo(left, top + h, left, top + h - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a diamond (endpoint nodes) */
function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const s = size * 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a hexagon (model nodes) */
function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const s = size * 1.2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + s * Math.cos(angle);
    const py = y + s * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

const shapeDrawers: Record<
  string,
  (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string
  ) => void
> = {
  route: drawCircle,
  component: drawRoundedRect,
  endpoint: drawDiamond,
  model: drawHexagon,
  auth_strategy: drawCircle,
  middleware: drawRoundedRect,
  utility: drawCircle,
};

/** Main node canvas render function passed to ForceGraph2D */
export function renderNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number
): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const size = getNodeSize(node.type);
  const color = getNodeColor(node.testStatus);
  const draw = shapeDrawers[node.type] ?? drawCircle;

  // Glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  draw(ctx, x, y, size, color);
  ctx.shadowBlur = 0;

  // Label — only render when zoomed in enough
  if (globalScale > 1.2) {
    const label =
      node.name.length > 20 ? node.name.slice(0, 18) + "..." : node.name;
    const fontSize = Math.max(10 / globalScale, 3);
    ctx.font = `${fontSize}px "Geist", Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText(label, x, y + size + 2);
  }
}

/** Highlight ring for selected node */
export function renderSelectedRing(
  node: GraphNode,
  ctx: CanvasRenderingContext2D
): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const size = getNodeSize(node.type) + 3;

  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Node pointer area paint for hit detection */
export function paintNodePointerArea(
  node: GraphNode,
  paintColor: string,
  ctx: CanvasRenderingContext2D
): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const size = getNodeSize(node.type) + 2;

  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fillStyle = paintColor;
  ctx.fill();
}
