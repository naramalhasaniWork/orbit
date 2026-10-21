import { describe, it, expect } from "vitest";
import {
  TOUR_IDLE,
  buildTourStops,
  currentStop,
  shouldStartTour,
  tourReducer,
  type TourContext,
  type TourState,
} from "@/lib/onboarding/tour";

const ctx = (over: Partial<TourContext> = {}): TourContext => ({
  projectId: "p1",
  projectName: "acme",
  run: { id: "r1", number: 3, total: 12, passed: 10, failed: 2 },
  nodeCount: 45,
  githubConnected: false,
  ...over,
});

const started = (c = ctx()): TourState => tourReducer(TOUR_IDLE, { type: "start", stops: buildTourStops(c) });

describe("buildTourStops", () => {
  it("walks run, failure, map, PR check, integrations and the palette", () => {
    expect(buildTourStops(ctx()).map((s) => s.target)).toEqual([
      "run", "what-broke", "system-map", "github", "integrations", "command-palette",
    ]);
  });

  it("points at the pass summary when nothing failed", () => {
    const stops = buildTourStops(ctx({ run: { id: "r1", number: 1, total: 4, passed: 4, failed: 0 } }));
    expect(stops[1]).toMatchObject({ target: "run-stats", title: "All passed" });
    expect(stops[1].body).toContain("4 tests passed");
  });

  it("leaves out the run stops before the first run", () => {
    expect(buildTourStops(ctx({ run: null })).map((s) => s.id)).toEqual(["map", "pr", "integrations", "palette"]);
  });

  it("builds copy from the workspace's own numbers", () => {
    const [run, result, map] = buildTourStops(ctx());
    expect(run.title).toBe("Run #3");
    expect(run.body).toContain("12 tests of acme");
    expect(run.href).toBe("/dashboard/runs/r1?project=p1");
    expect(result.body).toContain("all 2 failures");
    expect(map.body).toContain("45 nodes");
  });

  it("says GitHub is connected only when it is", () => {
    expect(buildTourStops(ctx({ githubConnected: true }))[3].body).toMatch(/^GitHub is connected/);
    expect(buildTourStops(ctx())[3].body).toMatch(/^Connect GitHub/);
  });
});

describe("tourReducer", () => {
  it("starts on the first stop", () => {
    expect(currentStop(started())?.id).toBe("run");
  });

  it("next moves one stop and finishes after the last", () => {
    let s = started();
    for (let i = 0; i < 5; i++) s = tourReducer(s, { type: "next" });
    expect(currentStop(s)?.id).toBe("palette");
    s = tourReducer(s, { type: "next" });
    expect(s).toMatchObject({ status: "done", outcome: "finished" });
    expect(currentStop(s)).toBeNull();
  });

  it("skip ends the tour from any stop", () => {
    const s = tourReducer(tourReducer(started(), { type: "next" }), { type: "skip" });
    expect(s).toMatchObject({ status: "done", outcome: "skipped" });
  });

  it("Esc ends the tour like skip", () => {
    expect(tourReducer(started(), { type: "escape" })).toMatchObject({ status: "done", outcome: "skipped" });
  });

  it("a missing target skips to the next stop", () => {
    const s = tourReducer(started(), { type: "missing", id: "run" });
    expect(currentStop(s)?.id).toBe("result");
  });

  it("a missing last target finishes the tour", () => {
    let s = started(ctx({ run: null }));
    for (let i = 0; i < 3; i++) s = tourReducer(s, { type: "next" });
    s = tourReducer(s, { type: "missing", id: "palette" });
    expect(s).toMatchObject({ status: "done", outcome: "finished" });
  });

  it("ignores a late missing report for a stop already left", () => {
    const s = tourReducer(started(), { type: "next" });
    expect(currentStop(tourReducer(s, { type: "missing", id: "run" }))?.id).toBe("result");
  });

  it("does nothing once done", () => {
    const done = tourReducer(started(), { type: "skip" });
    expect(tourReducer(done, { type: "next" })).toBe(done);
  });

  it("an empty tour is done at once", () => {
    expect(tourReducer(TOUR_IDLE, { type: "start", stops: [] }).status).toBe("done");
  });
});

describe("shouldStartTour", () => {
  it("shows the post-run tour once", () => {
    expect(shouldStartTour("start", null)).toBe(true);
    expect(shouldStartTour("start", "2026-10-20T00:00:00.000Z")).toBe(false);
  });

  it("never starts without the param", () => {
    expect(shouldStartTour(null, null)).toBe(false);
    expect(shouldStartTour("replay", null)).toBe(false);
  });
});
