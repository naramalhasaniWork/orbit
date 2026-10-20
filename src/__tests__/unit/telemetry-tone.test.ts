import { describe, it, expect } from "vitest";
import {
  STATUS_TONES,
  summarizeTones,
  toneForHealth,
  toneForRun,
  toneForVerdict,
} from "@/lib/status-tone";
import { cutForSize, DISPLAY_CUT, SMALL_CUT, markTileSvg } from "@/lib/closing-o";
import { nextPreference, parsePreference, resolveTheme, themeInitScript } from "@/lib/theme";

describe("status tones", () => {
  it("pairs every tone with a glyph and a word", () => {
    for (const spec of Object.values(STATUS_TONES)) {
      expect(spec.glyph.length).toBeGreaterThan(0);
      expect(spec.label.length).toBeGreaterThan(0);
    }
    expect(STATUS_TONES.fail.glyph).toBe("✕");
    expect(STATUS_TONES.fail.square).toBe(true);
    expect(STATUS_TONES.flaky.glyph).toBe("◐");
  });

  it("only live uses the accent", () => {
    const accentUsers = Object.entries(STATUS_TONES).filter(([, s]) => s.fill.includes("live"));
    expect(accentUsers.map(([t]) => t)).toEqual(["live"]);
  });

  it("maps runs: active is live, completed with failures fails, flakes only is flaky", () => {
    expect(toneForRun("executing")).toBe("live");
    expect(toneForRun("completed", { failed: 2 })).toBe("fail");
    expect(toneForRun("completed", { flaky: 1 })).toBe("flaky");
    expect(toneForRun("completed")).toBe("pass");
    expect(toneForRun("failed")).toBe("fail");
    expect(toneForRun("cancelled")).toBe("skipped");
    expect(toneForRun("queued")).toBe("untested");
  });

  it("maps verdicts and health", () => {
    expect(toneForVerdict("healed")).toBe("pass");
    expect(toneForVerdict("environment_error")).toBe("fail");
    expect(toneForHealth("degraded")).toBe("flaky");
  });

  it("summarises a strip for screen readers", () => {
    expect(summarizeTones(["pass", "pass", "fail"], "runs")).toBe("3 runs: 2 passed, 1 failed");
    expect(summarizeTones([], "runs")).toBe("No runs yet");
  });
});

describe("Closing O", () => {
  it("uses the small cut below 24px", () => {
    expect(cutForSize(16)).toBe(SMALL_CUT);
    expect(cutForSize(24)).toBe(DISPLAY_CUT);
    expect(SMALL_CUT.stroke).toBe(3);
    expect(DISPLAY_CUT.dot.r).toBe(2);
  });

  it("draws a fail square, a closed pass circle and a running track in the tile", () => {
    expect(markTileSvg("failed", 32)).toContain("<rect x=");
    expect(markTileSvg("passed", 32)).toContain('r="8.5"');
    expect(markTileSvg("running", 32)).toContain('cy="20.5"');
    expect(markTileSvg("idle", 32)).toContain(SMALL_CUT.arc);
    expect(markTileSvg("idle", 180)).toContain(DISPLAY_CUT.arc);
  });
});

describe("theme", () => {
  it("defaults to system and resolves against the OS", () => {
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("bogus")).toBe("system");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("cycles system → light → dark → system", () => {
    expect(nextPreference("system")).toBe("light");
    expect(nextPreference("dark")).toBe("system");
  });

  it("paints the dark class before hydration from storage or the OS", () => {
    const store = new Map<string, string>([["orbit-theme", "dark"]]);
    const classes = new Set<string>();
    const html = {
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      style: { colorScheme: "" },
    };
    const run = new Function("localStorage", "matchMedia", "document", themeInitScript);
    run({ getItem: (k: string) => store.get(k) ?? null }, () => ({ matches: false }), { documentElement: html });
    expect(classes.has("dark")).toBe(true);
    expect(html.style.colorScheme).toBe("dark");

    store.clear();
    run({ getItem: () => null }, () => ({ matches: false }), { documentElement: html });
    expect(classes.has("dark")).toBe(false);
  });
});

describe("runWord", () => {
  it("never says Completed next to a ✕", async () => {
    const { runWord } = await import("@/lib/status-tone");
    expect(runWord("completed", { failed: 2 })).toBe("Failed");
    expect(runWord("completed", { flaky: 1 })).toBe("Flaky");
    expect(runWord("completed")).toBe("Passed");
    expect(runWord("executing")).toBe("Executing");
  });
});
