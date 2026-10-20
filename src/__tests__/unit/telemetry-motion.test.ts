import { describe, it, expect } from "vitest";
import {
  crossfade,
  durations,
  exitDuration,
  motionSafe,
  routeChild,
  routeBack,
  routeDirection,
  routeVariants,
  staggerDelay,
  stepBarTiming,
} from "@/lib/motion";

describe("motion tokens", () => {
  it("keeps every duration within the 120–280ms scale and under 400ms", () => {
    expect(Object.values(durations)).toEqual([0.12, 0.18, 0.24, 0.28]);
  });

  it("runs exits at 70% of the entry", () => {
    expect(exitDuration(0.24)).toBe(0.168);
  });

  it("caps stagger at six items, 24ms apart", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBeCloseTo(0.048);
    expect(staggerDelay(40)).toBeCloseTo(0.12);
  });
});

describe("reduced motion", () => {
  it("swaps any movement for the cross-fade", () => {
    expect(motionSafe(routeChild, true)).toBe(crossfade);
    expect(motionSafe(routeChild, false)).toBe(routeChild);
    expect(routeVariants("child", true)).toBe(crossfade);
  });

  it("cross-fade moves nothing", () => {
    expect(crossfade.initial).toEqual({ opacity: 0 });
  });
});

describe("routeDirection", () => {
  it("goes into a child, back to a parent, across to a sibling", () => {
    expect(routeDirection("/dashboard/runs", "/dashboard/runs/abc")).toBe("child");
    expect(routeDirection("/dashboard/runs/abc", "/dashboard/runs")).toBe("back");
    expect(routeDirection("/dashboard/runs", "/dashboard/plans")).toBe("sibling");
    expect(routeDirection(null, "/dashboard")).toBe("none");
    expect(routeVariants("back", false)).toBe(routeBack);
  });

  it("route motion starts at 0.15 opacity, never 0", () => {
    expect(routeChild.initial).toMatchObject({ opacity: 0.15, y: 8 });
    expect(routeBack.initial).toMatchObject({ opacity: 0.15, y: -4 });
  });
});

describe("stepBarTiming", () => {
  it("resumes the grow animation at the elapsed point via a negative delay", () => {
    expect(stepBarTiming(1_000, 4_000, 10_000)).toEqual({ delayMs: -3_000, durationMs: 10_000, progress: 0.3 });
  });

  it("holds at full once the expected time has passed", () => {
    expect(stepBarTiming(0, 60_000, 10_000)).toMatchObject({ delayMs: -10_000, progress: 1 });
  });

  it("treats clock skew (start in the future) as just started", () => {
    expect(stepBarTiming(5_000, 4_000, 10_000)).toMatchObject({ delayMs: -0, progress: 0 });
  });
});
