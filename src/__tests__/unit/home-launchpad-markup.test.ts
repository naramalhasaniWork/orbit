import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MapPreview } from "@/components/dashboard/map-preview";
import { PullRequestList } from "@/components/dashboard/pull-request-list";
import type { MapEdge, MapNode } from "@/components/dashboard/map-types";
import type { PullRequestRow } from "@/lib/dashboard/launchpad-shape";

const node = (id: string, type: MapNode["type"], changeStatus?: MapNode["changeStatus"]): MapNode => ({
  id, type, name: id, filePath: null, metadata: null, changeStatus,
});

describe("home map preview", () => {
  const nodes = [node("/checkout", "route"), node("CartForm", "component"), node("Order", "model", "modified")];
  const edges: MapEdge[] = [
    { id: "e1", sourceId: "/checkout", targetId: "CartForm", relationship: "renders" },
    { id: "e2", sourceId: "CartForm", targetId: "Order", relationship: "writes" },
  ];

  it("is one link to the impact view with a static map inside: no nested buttons", () => {
    const html = renderToStaticMarkup(createElement(MapPreview, { nodes, edges, projectId: "p1" }));
    expect(html).toContain('href="/dashboard/map?project=p1&amp;view=impact"');
    expect(html).not.toContain("<button");
    expect(html).toContain("1 changed in the last sync, 2 depending on them");
  });

  it("says nothing changed when the last sync changed nothing", () => {
    const html = renderToStaticMarkup(createElement(MapPreview, { nodes: nodes.slice(0, 2), edges, projectId: "p1" }));
    expect(html).toContain("Nothing changed in the last sync");
  });
});

describe("home pull request list", () => {
  const row: PullRequestRow = {
    runId: "r1", runNumber: 12, ref: "acme/web#318", title: "Fix the coupon field", triggerLabel: "PR",
    branch: "fix/coupon", commit: "7c2a1b9", author: { name: "Dana", email: "dana@acme.dev", image: null },
    journeys: ["Checkout", "Sign in", "Search", "Admin"], tone: "fail", durationMs: 90_000, createdAt: new Date().toISOString(),
  };

  it("links each row to its run and says the verdict in words", () => {
    const html = renderToStaticMarkup(createElement(PullRequestList, { rows: [row], projectId: "p1" }));
    expect(html).toContain('href="/dashboard/runs/r1?project=p1"');
    expect(html).toContain("acme/web#318");
    expect(html).toContain("Failed");
    expect(html).toContain("4 journeys");
    expect(html).toContain("+1");
  });

  it("an empty list offers one next step", () => {
    const html = renderToStaticMarkup(createElement(PullRequestList, { rows: [], projectId: "p1" }));
    expect(html).toContain("Connect GitHub");
  });
});
