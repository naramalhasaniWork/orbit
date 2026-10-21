import { describe, it, expect } from "vitest";
import {
  EMPTY_ASSEMBLY,
  applyAssemblyEvents,
  toAssemblyEvent,
  type AssemblyEvent,
} from "@/lib/onboarding/map-assembly";

const node = (nodeId: string, nodeType: string): AssemblyEvent => ({
  type: "indexing:node_discovered",
  data: { nodeId, nodeType, nodeName: nodeId, filePath: null },
});
const edge = (edgeId: string, sourceId: string, targetId: string): AssemblyEvent => ({
  type: "indexing:edge_discovered",
  data: { edgeId, sourceId, targetId, relationship: "renders" },
});

describe("applyAssemblyEvents", () => {
  it("adds nodes as they are discovered and counts them per layer", () => {
    const s = applyAssemblyEvents(EMPTY_ASSEMBLY, [
      { type: "indexing:started" },
      node("/login", "route"),
      node("LoginForm", "component"),
      node("useAuth", "utility"),
      node("POST /api/session", "endpoint"),
      node("auth", "auth_strategy"),
      node("User", "model"),
    ]);
    expect(s.status).toBe("indexing");
    expect(s.nodes.map((n) => n.id)).toEqual(["/login", "LoginForm", "useAuth", "POST /api/session", "auth", "User"]);
    expect(s.counts).toEqual({ routes: 1, components: 2, apis: 2, models: 1 });
  });

  it("draws an edge only between nodes already on the map", () => {
    const s = applyAssemblyEvents(EMPTY_ASSEMBLY, [
      node("a", "route"),
      node("b", "component"),
      edge("e1", "a", "b"),
      edge("e2", "a", "ghost"),
    ]);
    expect(s.edges).toEqual([{ id: "e1", sourceId: "a", targetId: "b", relationship: "renders" }]);
  });

  it("ignores events replayed after a reconnect", () => {
    const once = applyAssemblyEvents(EMPTY_ASSEMBLY, [node("a", "route"), node("b", "model"), edge("e1", "a", "b")]);
    const twice = applyAssemblyEvents(once, [node("a", "route"), edge("e1", "a", "b")]);
    expect(twice.nodes).toHaveLength(2);
    expect(twice.edges).toHaveLength(1);
    expect(twice.counts.routes).toBe(1);
  });

  it("gives the same result batched or one event at a time", () => {
    const events = [node("a", "route"), node("b", "component"), edge("e", "a", "b"), { type: "indexing:completed" } as const];
    const batched = applyAssemblyEvents(EMPTY_ASSEMBLY, events);
    const single = events.reduce((s, e) => applyAssemblyEvents(s, [e]), EMPTY_ASSEMBLY);
    expect(single.nodes).toEqual(batched.nodes);
    expect(single.edges).toEqual(batched.edges);
    expect(single.status).toBe("complete");
  });

  it("starts over when a new index starts", () => {
    const old = applyAssemblyEvents(EMPTY_ASSEMBLY, [node("a", "route"), { type: "indexing:completed" }]);
    const fresh = applyAssemblyEvents(old, [{ type: "indexing:started" }, node("b", "model")]);
    expect(fresh.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(fresh.counts).toEqual({ routes: 0, components: 0, apis: 0, models: 1 });
    expect(fresh.status).toBe("indexing");
  });

  it("records a failure and keeps what was found", () => {
    const s = applyAssemblyEvents(EMPTY_ASSEMBLY, [node("a", "route"), { type: "indexing:failed" }]);
    expect(s.status).toBe("failed");
    expect(s.nodes).toHaveLength(1);
  });

  it("returns the same state for an empty batch", () => {
    expect(applyAssemblyEvents(EMPTY_ASSEMBLY, [])).toBe(EMPTY_ASSEMBLY);
  });
});

describe("toAssemblyEvent", () => {
  it("reads node and edge payloads from the SSE message", () => {
    expect(toAssemblyEvent({ type: "indexing:node_discovered", data: { nodeId: "n", nodeType: "route", nodeName: "/", filePath: "app/page.tsx" } }))
      .toEqual({ type: "indexing:node_discovered", data: { nodeId: "n", nodeType: "route", nodeName: "/", filePath: "app/page.tsx" } });
    expect(toAssemblyEvent({ type: "indexing:edge_discovered", data: { edgeId: "e", sourceId: "a", targetId: "b", relationship: "calls" } }))
      .toMatchObject({ type: "indexing:edge_discovered", data: { edgeId: "e" } });
  });

  it("drops malformed payloads and unrelated events", () => {
    expect(toAssemblyEvent({ type: "indexing:node_discovered", data: { nodeId: 1 } })).toBeNull();
    expect(toAssemblyEvent({ type: "indexing:phase", data: {} })).toBeNull();
    expect(toAssemblyEvent({ type: "heartbeat", data: null })).toBeNull();
  });
});
