import { describe, it, expect } from "vitest";
import {
  decideExecution, isReplayBenched, shouldCompile, LOCATOR_TIMEOUT_MS, SUSPECT_LOCATOR_TIMEOUT_MS,
} from "@/server/engine/replay/replay-policy";
import type { StoredScript } from "@/server/engine/replay/script-store";
import { buildEnvKey, stepsHash } from "@/server/engine/replay/script-keys";

const now = new Date("2026-10-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const steps = [{ action: "Click Save", expected: "Saved" }];

function script(extra: Partial<StoredScript> = {}): StoredScript {
  return {
    id: "s1", version: 1, status: "active", stepsHash: stepsHash(steps), actions: [],
    lastVerifiedByAgentAt: new Date(now.getTime() - DAY), ...extra,
  };
}
const base = { stepsHash: stepsHash(steps), recentDivergences: [] as boolean[], now, random: () => 0.5 };

describe("decideExecution", () => {
  it("runs the agent and compiles when there is no script", () => {
    const decision = decideExecution({ ...base, script: null });
    expect(decision).toEqual({ use: "agent", reason: "no_script" });
    expect(shouldCompile(decision)).toBe(true);
  });

  it("ignores a script whose steps hash no longer matches the case", () => {
    const decision = decideExecution({ ...base, script: script({ stepsHash: "old" }) });
    expect(decision).toEqual({ use: "agent", reason: "steps_changed" });
    expect(shouldCompile(decision)).toBe(true);
  });

  it("replays an active script with normal locator timeouts", () => {
    expect(decideExecution({ ...base, script: script() }))
      .toMatchObject({ use: "replay", locatorTimeoutMs: LOCATOR_TIMEOUT_MS });
  });

  it("replays a suspect script with 2s locator timeouts", () => {
    expect(decideExecution({ ...base, script: script({ status: "suspect" }) }))
      .toMatchObject({ use: "replay", locatorTimeoutMs: SUSPECT_LOCATOR_TIMEOUT_MS });
  });

  it("re-verifies with the agent 1 in 20 replays, without recompiling", () => {
    const sampled = decideExecution({ ...base, script: script(), random: () => 0.049 });
    expect(sampled).toMatchObject({ use: "agent", reason: "reverify" });
    expect(shouldCompile(sampled)).toBe(false);
    expect(decideExecution({ ...base, script: script(), random: () => 0.05 })).toMatchObject({ use: "replay" });
  });

  it("re-verifies a script the agent has not checked for 14 days", () => {
    const stale = script({ lastVerifiedByAgentAt: new Date(now.getTime() - 15 * DAY) });
    expect(decideExecution({ ...base, script: stale })).toMatchObject({ use: "agent", reason: "reverify" });
    const fresh = script({ lastVerifiedByAgentAt: new Date(now.getTime() - 13 * DAY) });
    expect(decideExecution({ ...base, script: fresh })).toMatchObject({ use: "replay" });
  });

  it("benches replay when more than 30% of the last 10 replays diverged", () => {
    const four = [true, false, true, false, true, false, true, false, false, false];
    const decision = decideExecution({ ...base, script: script(), recentDivergences: four });
    expect(decision).toMatchObject({ use: "agent", reason: "flaky" });
    expect(shouldCompile(decision)).toBe(false);
  });
});

describe("isReplayBenched (flake guard)", () => {
  it("allows exactly 30% and benches above it", () => {
    expect(isReplayBenched([true, true, true, false, false, false, false, false, false, false])).toBe(false);
    expect(isReplayBenched([true, true, true, true, false, false, false, false, false, false])).toBe(true);
  });

  it("only looks at the last 10 replays", () => {
    const old = [false, false, false, false, false, false, false, false, false, false, true, true, true, true];
    expect(isReplayBenched(old)).toBe(false);
  });

  it("does not bench a young script on a single divergence", () => {
    expect(isReplayBenched([true])).toBe(false);
    expect(isReplayBenched([true, true, true, true])).toBe(true);
  });
});

describe("script keys", () => {
  it("keys scripts by environment, role and viewport", () => {
    expect(buildEnvKey("env-1", "admin")).toBe("env-1:ADMIN:1280x720");
    expect(buildEnvKey("env-1", undefined, { width: 375, height: 667 })).toBe("env-1:DEFAULT:375x667");
  });

  it("changes the steps hash when a step changes", () => {
    expect(stepsHash(steps)).toBe(stepsHash([{ action: " Click Save ", expected: "Saved" }]));
    expect(stepsHash(steps)).not.toBe(stepsHash([{ action: "Click Save", expected: "Saved!" }]));
  });
});
