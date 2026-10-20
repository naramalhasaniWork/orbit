import { describe, it, expect } from "vitest";
import { connectedPath, impactOf, layerOf, layoutLayers } from "@/lib/map/layered";

const n = (id: string, type: string) => ({ id, type, name: id });

describe("layered System Map", () => {
  it("puts routes, components, APIs and data in left-to-right layers", () => {
    expect([layerOf("route"), layerOf("component"), layerOf("endpoint"), layerOf("model")]).toEqual([0, 1, 2, 3]);
    expect(layerOf("utility")).toBe(1);
    expect(layerOf("auth_strategy")).toBe(2);
  });

  it("orders a layer by its neighbours' rows to cut crossings", () => {
    const nodes = [n("r-a", "route"), n("r-b", "route"), n("c-b", "component"), n("c-a", "component")];
    const edges = [
      { sourceId: "r-a", targetId: "c-a" },
      { sourceId: "r-b", targetId: "c-b" },
    ];
    const rows = Object.fromEntries(layoutLayers(nodes, edges).placed.map((p) => [p.node.id, p.row]));
    expect(rows["c-a"]).toBe(rows["r-a"]);
    expect(rows["c-b"]).toBe(rows["r-b"]);
  });

  it("collapses a crowded layer, keeping the best-connected nodes", () => {
    const nodes = [n("hub", "component"), n("lone1", "component"), n("lone2", "component"), n("r", "route")];
    const layout = layoutLayers(nodes, [{ sourceId: "r", targetId: "hub" }], 1);
    expect(layout.placed.filter((p) => p.layer === 1).map((p) => p.node.id)).toEqual(["hub"]);
    expect(layout.collapsed[1]).toBe(2);
  });

  it("selects a journey path in both directions, bounded by depth", () => {
    const edges = [
      { sourceId: "a", targetId: "b" },
      { sourceId: "b", targetId: "c" },
      { sourceId: "c", targetId: "d" },
    ];
    expect(Array.from(connectedPath("b", edges, 1)).sort()).toEqual(["a", "b", "c"]);
  });

  it("impact: changed nodes plus everything that depends on them", () => {
    const edges = [
      { sourceId: "page", targetId: "form" },
      { sourceId: "form", targetId: "api" },
      { sourceId: "other", targetId: "util" },
    ];
    expect(Array.from(impactOf(new Set(["api"]), edges)).sort()).toEqual(["api", "form", "page"]);
  });
});
