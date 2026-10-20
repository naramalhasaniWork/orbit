/**
 * Layered, left-to-right System Map: routes → components → APIs → data.
 * Never force-directed. Within a layer, nodes are ordered by the average position of
 * their neighbours in the previous layer (one barycentre pass) to cut crossings.
 */
export interface LayerNode {
  id: string;
  type: string;
  name: string;
}

export interface LayerEdge {
  sourceId: string;
  targetId: string;
}

export const LAYERS = [
  { id: "routes", label: "Routes", types: ["route"] },
  { id: "components", label: "Components", types: ["component", "utility"] },
  { id: "apis", label: "APIs", types: ["endpoint", "middleware", "auth_strategy"] },
  { id: "data", label: "Data", types: ["model"] },
] as const;

/** Above this many nodes in a layer, the rest collapse into a "+N more" stub. */
export const LAYER_CAP = 40;

export interface PlacedNode<N extends LayerNode = LayerNode> {
  node: N;
  layer: number;
  row: number;
}

export interface LayeredLayout<N extends LayerNode = LayerNode> {
  placed: PlacedNode<N>[];
  /** Hidden nodes per layer (beyond LAYER_CAP). */
  collapsed: number[];
  rows: number;
}

export function layerOf(type: string): number {
  const i = LAYERS.findIndex((l) => (l.types as readonly string[]).includes(type));
  return i < 0 ? 1 : i;
}

function neighbours(edges: LayerEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    m.set(e.sourceId, [...(m.get(e.sourceId) ?? []), e.targetId]);
    m.set(e.targetId, [...(m.get(e.targetId) ?? []), e.sourceId]);
  }
  return m;
}

export function layoutLayers<N extends LayerNode>(nodes: N[], edges: LayerEdge[], cap = LAYER_CAP): LayeredLayout<N> {
  const adj = neighbours(edges);
  const degree = (id: string) => adj.get(id)?.length ?? 0;
  const columns: N[][] = LAYERS.map(() => []);
  for (const n of nodes) columns[layerOf(n.type)].push(n);

  const collapsed: number[] = [];
  const rowOf = new Map<string, number>();
  const placed: PlacedNode<N>[] = [];

  columns.forEach((col, layer) => {
    // Keep the best-connected nodes when a layer is over the cap.
    const kept = col.length > cap ? [...col].sort((a, b) => degree(b.id) - degree(a.id)).slice(0, cap) : col;
    collapsed.push(col.length - kept.length);
    const bary = (n: N) => {
      const rows = (adj.get(n.id) ?? []).map((id) => rowOf.get(id)).filter((r): r is number => r !== undefined);
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.POSITIVE_INFINITY;
    };
    const ordered = [...kept].sort((a, b) => bary(a) - bary(b) || a.name.localeCompare(b.name));
    ordered.forEach((n, row) => {
      rowOf.set(n.id, row);
      placed.push({ node: n, layer, row });
    });
  });

  return { placed, collapsed, rows: Math.max(1, ...columns.map((c, i) => Math.min(c.length, cap) + (collapsed[i] > 0 ? 1 : 0))) };
}

/** Everything reachable from `start` along edges in either direction, up to `depth` hops. */
export function connectedPath(start: string, edges: LayerEdge[], depth = 4): Set<string> {
  const adj = neighbours(edges);
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const n of adj.get(id) ?? []) if (!seen.has(n)) (seen.add(n), next.push(n));
    frontier = next;
  }
  return seen;
}

/** Impact of a change: the changed nodes plus everything that depends on them (edges point dependent → dependency). */
export function impactOf(changed: Set<string>, edges: LayerEdge[]): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const e of edges) dependents.set(e.targetId, [...(dependents.get(e.targetId) ?? []), e.sourceId]);
  const hit = new Set(changed);
  const queue = Array.from(changed);
  while (queue.length) {
    const id = queue.shift() as string;
    for (const d of dependents.get(id) ?? []) if (!hit.has(d)) (hit.add(d), queue.push(d));
  }
  return hit;
}
