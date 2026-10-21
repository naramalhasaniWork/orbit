import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const reduced = vi.hoisted(() => ({ value: true }));
vi.mock("framer-motion", async (orig) => ({
  ...(await orig<typeof import("framer-motion")>()),
  useReducedMotion: () => reduced.value,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/runs/abc",
  useSearchParams: () => new URLSearchParams("project=p1"),
}));

import { RouteTransition, entranceFor, nextRoute, routeKey, type RouteState } from "@/components/layout/route-transition";
import { routeChild, routeSibling, routeVariants, tabStep } from "@/lib/motion";
import {
  beginSharedNavigation,
  isSharedNavigationPending,
  settleSharedNavigation,
  sharedName,
  viewTransitionStarter,
} from "@/lib/view-transition";

const SETTINGS = ["/dashboard/settings", "/dashboard/settings/providers", "/dashboard/settings/mcp", "/dashboard/settings/members"];
const start: RouteState = { key: "a", path: "/dashboard/runs", direction: "none", step: null, animate: false };

describe("RouteTransition", () => {
  it("renders the final state under reduced motion: no offset, no faded opacity", () => {
    reduced.value = true;
    const html = renderToStaticMarkup(createElement(RouteTransition, null, createElement("p", null, "Run #4")));
    expect(html).toContain("Run #4");
    expect(html).not.toMatch(/opacity:\s*0\.15/);
    expect(html).not.toContain("translate");
  });

  it("swaps instantly under reduced motion even after a navigation", () => {
    const route = nextRoute(start, "b", "/dashboard/runs/abc", undefined, false);
    expect(entranceFor(route, true)).toBe(false);
    expect(entranceFor(route, false)).toBe("initial");
  });

  it("does not play its own entrance when a shared-element View Transition carries the swap", () => {
    expect(entranceFor(nextRoute(start, "b", "/dashboard/runs/abc", undefined, true), false)).toBe(false);
  });

  it("holds still inside a prefix a nested transition owns", () => {
    expect(routeKey("/dashboard/settings/mcp", "", ["/dashboard/settings"])).toBe(routeKey("/dashboard/settings", "", ["/dashboard/settings"]));
    expect(routeKey("/dashboard/runs", "p1", ["/dashboard/settings"])).toBe("/dashboard/runs?p1");
  });
});

describe("tab direction", () => {
  it("slides toward the tab picked, the nested General tab included", () => {
    expect(tabStep("/dashboard/settings", "/dashboard/settings/mcp", SETTINGS)).toBe(1);
    expect(tabStep("/dashboard/settings/members", "/dashboard/settings/providers", SETTINGS)).toBe(-1);
    expect(tabStep("/dashboard/runs", "/dashboard/settings", SETTINGS)).toBeNull();
  });

  it("a tab move is sideways; any other sibling move is a rise", () => {
    const tab = nextRoute({ ...start, path: "/dashboard/settings" }, "b", "/dashboard/settings/mcp", SETTINGS, false);
    expect(tab).toMatchObject({ direction: "sibling", step: 1 });
    expect(routeVariants(tab.direction, false, tab.step).initial).toEqual(routeSibling(1).initial);
    expect(routeVariants("sibling", false)).toBe(routeChild);
  });

  it("route swaps stay inside the 160–220ms band", () => {
    expect(routeChild.animate).toMatchObject({ transition: { duration: 0.18 } });
  });
});

describe("shared-element navigation", () => {
  afterEach(() => settleSharedNavigation());

  it("is pending until the route commits", async () => {
    const done = beginSharedNavigation(1_000);
    expect(isSharedNavigationPending()).toBe(true);
    settleSharedNavigation();
    await done;
    expect(isSharedNavigationPending()).toBe(false);
  });

  it("never holds the old frame past its timeout", async () => {
    vi.useFakeTimers();
    const done = beginSharedNavigation(400);
    vi.advanceTimersByTime(400);
    await done;
    expect(isSharedNavigationPending()).toBe(false);
    vi.useRealTimers();
  });

  it("is off without the API and under reduced motion", () => {
    const doc = { startViewTransition: () => ({ finished: Promise.resolve() }) };
    expect(viewTransitionStarter({}, false)).toBeNull();
    expect(viewTransitionStarter(doc, true)).toBeNull();
    expect(viewTransitionStarter(doc, false)).toBeTypeOf("function");
  });

  it("names are valid CSS idents", () => {
    expect(sharedName("run", "3f2a.b/c")).toBe("run-3f2a-b-c");
    expect(sharedName("system-map")).toBe("system-map");
  });
});
