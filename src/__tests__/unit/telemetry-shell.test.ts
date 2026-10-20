import { describe, it, expect } from "vitest";
import { isActiveHref, settingsSections, SHORTCUTS, withProjectParam, BILLING_HREF } from "@/components/layout/nav-model";
import { needsYou, stripTicks, type SidebarRun } from "@/components/layout/sidebar-data";
import { ageShort, clock } from "@/lib/telemetry-format";
import { parseSidebarExpanded, sidebarCookie } from "@/lib/sidebar-pref";

const run = (over: Partial<SidebarRun>): SidebarRun => ({
  id: "r",
  sequenceNumber: 1,
  status: "completed",
  failed: 0,
  flaky: 0,
  createdAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

describe("nav model", () => {
  it("keeps every former nav destination reachable", () => {
    const hrefs = [...SHORTCUTS.map((s) => s.href), ...settingsSections({ hideBilling: false }).map((s) => s.href)];
    for (const h of [
      "/dashboard", "/dashboard/agent", "/dashboard/map", "/dashboard/operations", "/dashboard/plans",
      "/dashboard/runs", "/dashboard/audit", "/dashboard/settings", "/dashboard/settings/providers",
      "/dashboard/settings/mcp", "/dashboard/settings/members", BILLING_HREF,
    ]) {
      expect(hrefs).toContain(h);
    }
  });

  it("hides billing on self-hosted instances", () => {
    expect(settingsSections({ hideBilling: true }).map((s) => s.href)).not.toContain(BILLING_HREF);
  });

  it("matches roots exactly and children by prefix", () => {
    expect(isActiveHref("/dashboard/runs", "/dashboard")).toBe(false);
    expect(isActiveHref("/dashboard/runs/abc", "/dashboard/runs")).toBe(true);
    expect(isActiveHref("/dashboard/runsx", "/dashboard/runs")).toBe(false);
    expect(isActiveHref("/dashboard/settings/mcp", "/dashboard/settings")).toBe(false);
  });

  it("carries the project to project pages but not to settings", () => {
    expect(withProjectParam("/dashboard/runs", "p1")).toBe("/dashboard/runs?project=p1");
    expect(withProjectParam("/dashboard/settings/mcp", "p1")).toBe("/dashboard/settings/mcp");
  });
});

describe("sidebar data", () => {
  it("draws the strip oldest-left from the newest-first API order, max 14", () => {
    const runs = Array.from({ length: 20 }, (_, i) => run({ id: `r${i}`, status: i === 0 ? "executing" : "completed" }));
    const ticks = stripTicks(runs);
    expect(ticks).toHaveLength(14);
    expect(ticks[13].tone).toBe("live");
  });

  it("needs you: the latest finished run per project, failures before flakes", () => {
    const rows = needsYou([
      { projectId: "a", projectName: "web", runs: [run({ id: "a2", status: "executing" }), run({ id: "a1", failed: 2 })] },
      { projectId: "b", projectName: "api", runs: [run({ id: "b1", flaky: 1, createdAt: "2026-10-20T10:00:00.000Z" })] },
      { projectId: "c", projectName: "ok", runs: [run({ id: "c1" }), run({ id: "c0", failed: 5 })] },
    ]);
    expect(rows.map((r) => [r.runId, r.tone, r.count])).toEqual([
      ["a1", "fail", 2],
      ["b1", "flaky", 1],
    ]);
  });
});

describe("format", () => {
  it("ages and clocks", () => {
    expect(ageShort(0, 30_000)).toBe("now");
    expect(ageShort(0, 2 * 3600_000)).toBe("2h");
    expect(clock(41_200)).toBe("0:41");
    expect(clock(3_729_000)).toBe("1:02:09");
  });
});

describe("sidebar preference", () => {
  it("defaults to the rail and round-trips the cookie", () => {
    expect(parseSidebarExpanded(undefined)).toBe(false);
    expect(sidebarCookie(true)).toMatch(/^orbit-sidebar=expanded;/);
    expect(parseSidebarExpanded("expanded")).toBe(true);
  });
});
