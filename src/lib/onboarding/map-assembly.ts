import { layerOf } from "@/lib/map/layered";
import type { MapEdge, MapNode, NodeType } from "@/components/dashboard/map-types";

/**
 * The System Map as indexing discovers it: nodes and edges from the indexing SSE stream, folded
 * into the shape the layered map renders. Pure, so the stream can be replayed in tests and
 * batched per animation frame in the UI.
 */

export interface AssemblyCounts {
  routes: number;
  components: number;
  apis: number;
  models: number;
}

export interface AssemblyState {
  status: "waiting" | "indexing" | "complete" | "failed";
  nodes: MapNode[];
  edges: MapEdge[];
  counts: AssemblyCounts;
  /** Ids already folded in; the stream replays after a reconnect. */
  seen: ReadonlySet<string>;
}

export type AssemblyEvent =
  | { type: "indexing:started" }
  | { type: "indexing:node_discovered"; data: { nodeId: string; nodeType: string; nodeName: string; filePath: string | null } }
  | { type: "indexing:edge_discovered"; data: { edgeId: string; sourceId: string; targetId: string; relationship: string } }
  | { type: "indexing:completed" }
  | { type: "indexing:failed" };

export const EMPTY_ASSEMBLY: AssemblyState = {
  status: "waiting",
  nodes: [],
  edges: [],
  counts: { routes: 0, components: 0, apis: 0, models: 0 },
  seen: new Set(),
};

const COUNT_KEYS: Array<keyof AssemblyCounts> = ["routes", "components", "apis", "models"];

/** Narrows a raw SSE message to an event the assembly understands, or null. */
export function toAssemblyEvent(message: { type: string; data: unknown }): AssemblyEvent | null {
  const d = (message.data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  switch (message.type) {
    case "indexing:started":
    case "indexing:completed":
    case "indexing:failed":
      return { type: message.type };
    case "indexing:node_discovered": {
      const [nodeId, nodeType, nodeName] = [str("nodeId"), str("nodeType"), str("nodeName")];
      if (!nodeId || !nodeType || !nodeName) return null;
      return { type: message.type, data: { nodeId, nodeType, nodeName, filePath: str("filePath") } };
    }
    case "indexing:edge_discovered": {
      const [edgeId, sourceId, targetId] = [str("edgeId"), str("sourceId"), str("targetId")];
      if (!edgeId || !sourceId || !targetId) return null;
      return { type: message.type, data: { edgeId, sourceId, targetId, relationship: str("relationship") ?? "" } };
    }
    default:
      return null;
  }
}

/** Folds a batch of events in one pass (one copy of each array per batch, not per event). */
export function applyAssemblyEvents(state: AssemblyState, events: AssemblyEvent[]): AssemblyState {
  if (events.length === 0) return state;
  let { status } = state;
  let nodes = state.nodes;
  let edges = state.edges;
  const addedNodes: MapNode[] = [];
  const addedEdges: MapEdge[] = [];
  const nextSeen = new Set(state.seen);
  const nextCounts = { ...state.counts };

  for (const event of events) {
    switch (event.type) {
      case "indexing:started":
        // A fresh index replaces the map: drop what an earlier stream left behind.
        status = "indexing";
        nodes = [];
        edges = [];
        addedNodes.length = 0;
        addedEdges.length = 0;
        nextSeen.clear();
        COUNT_KEYS.forEach((k) => (nextCounts[k] = 0));
        break;
      case "indexing:node_discovered": {
        const { nodeId, nodeType, nodeName, filePath } = event.data;
        if (nextSeen.has(nodeId)) break;
        nextSeen.add(nodeId);
        addedNodes.push({ id: nodeId, type: nodeType as NodeType, name: nodeName, filePath, metadata: null, testStatus: "untested" });
        nextCounts[COUNT_KEYS[layerOf(nodeType)]]++;
        if (status === "waiting") status = "indexing";
        break;
      }
      case "indexing:edge_discovered": {
        const { edgeId, sourceId, targetId, relationship } = event.data;
        // An edge only makes sense between nodes on the map.
        if (nextSeen.has(edgeId) || !nextSeen.has(sourceId) || !nextSeen.has(targetId)) break;
        nextSeen.add(edgeId);
        addedEdges.push({ id: edgeId, sourceId, targetId, relationship });
        break;
      }
      case "indexing:completed":
        status = "complete";
        break;
      case "indexing:failed":
        status = "failed";
        break;
    }
  }

  if (addedNodes.length) nodes = [...nodes, ...addedNodes];
  if (addedEdges.length) edges = [...edges, ...addedEdges];
  return { status, nodes, edges, counts: nextCounts, seen: nextSeen };
}
