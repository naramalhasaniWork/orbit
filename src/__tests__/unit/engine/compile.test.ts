import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/tracked-completion", () => ({ createTrackedCompletion: vi.fn() }));
vi.mock("@/lib/ai/model-router", () => ({ getModelForTask: vi.fn().mockResolvedValue("cheap-model") }));

import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { compileRecording } from "@/server/engine/replay/compile";
import { assertionHoldsOnSnapshot, deriveAssertions } from "@/server/engine/replay/assertion-deriver";
import type { RecordedRun, ResolvedAction, StepSnapshot } from "@/server/engine/replay/types";

const llm = createTrackedCompletion as ReturnType<typeof vi.fn>;
const billing = { workspaceId: "w1", projectId: "p1", runId: "r1" };
const steps = [
  { action: "Open the login page", expected: "Login form is shown" },
  { action: "Click Sign in", expected: "The dashboard greets the user" },
];

function action(stepIndex: number, extra: Partial<ResolvedAction> = {}): ResolvedAction {
  return {
    stepIndex, action: "click", locators: { css: "#go" },
    pre: { urlPattern: "/login" }, post: { urlPattern: "/dashboard" }, ...extra,
  };
}
function snap(stepIndex: number, visibleText: string, url = "https://s.example.com/dashboard"): StepSnapshot {
  return { stepIndex, url, title: "App", visibleText };
}
const asserted = (stepIndex: number) =>
  action(stepIndex, { action: "assert", post: { urlPattern: "/login", assertion: { type: "visible", expected: "Sign in" } } });

describe("compileRecording", () => {
  beforeEach(() => vi.clearAllMocks());

  it("compiles without a model call when every step already asserts", async () => {
    const derive = vi.fn();
    const recorded: RecordedRun = { actions: [asserted(0), asserted(1)], snapshots: [] };

    const outcome = await compileRecording({ steps, recorded, billing }, derive);

    expect(outcome).toMatchObject({ compiled: true });
    expect(derive).not.toHaveBeenCalled();
  });

  it("derives the missing assertions in one call and attaches them", async () => {
    const derive = vi.fn().mockResolvedValue(new Map([[1, { type: "text_contains", expected: "Welcome back" }]]));
    const recorded: RecordedRun = { actions: [asserted(0), action(1)], snapshots: [snap(1, "Welcome back, Ada")] };

    const outcome = await compileRecording({ steps, recorded, billing }, derive);

    expect(derive).toHaveBeenCalledTimes(1);
    expect(derive.mock.calls[0][0]).toEqual([
      { stepIndex: 1, action: "Click Sign in", expected: "The dashboard greets the user", snapshot: snap(1, "Welcome back, Ada") },
    ]);
    expect(outcome.compiled && outcome.actions[1].post.assertion).toEqual({ type: "text_contains", expected: "Welcome back" });
  });

  it("never compiles a script with a step that has no assertion", async () => {
    const derive = vi.fn().mockResolvedValue(new Map());
    const recorded: RecordedRun = { actions: [asserted(0), action(1)], snapshots: [snap(1, "Hello")] };

    const outcome = await compileRecording({ steps, recorded, billing }, derive);

    expect(outcome).toEqual({ compiled: false, reason: "Step 2 has no deterministic assertion" });
  });

  it("stays agent-only when deriving fails", async () => {
    const derive = vi.fn().mockRejectedValue(new Error("provider down"));
    const recorded: RecordedRun = { actions: [asserted(0), action(1)], snapshots: [snap(1, "Hello")] };

    expect(await compileRecording({ steps, recorded, billing }, derive))
      .toEqual({ compiled: false, reason: "Could not derive assertions: provider down" });
  });

  it("refuses incomplete or unreplayable recordings", async () => {
    const derive = vi.fn();
    expect(await compileRecording({ steps, recorded: { actions: [asserted(0)], snapshots: [] }, billing }, derive))
      .toEqual({ compiled: false, reason: "Step 2 has no recorded action" });
    expect(await compileRecording({
      steps, recorded: { actions: [asserted(0), asserted(1)], snapshots: [], uncompilable: "used an MCP tool call" }, billing,
    }, derive)).toEqual({ compiled: false, reason: "Run used an MCP tool call" });
    expect(derive).not.toHaveBeenCalled();
  });

  it("does not need assertions for login steps skipped on a live session", async () => {
    const recorded: RecordedRun = {
      actions: [{ stepIndex: 0, action: "skip_auth", pre: { urlPattern: "/" }, post: { urlPattern: "/" } }, asserted(1)],
      snapshots: [],
    };
    expect(await compileRecording({ steps, recorded, billing }, vi.fn())).toMatchObject({ compiled: true });
  });
});

describe("deriveAssertions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes one model call and keeps only assertions that hold on the captured page", async () => {
    llm.mockResolvedValue({
      content: JSON.stringify({ assertions: [
        { stepIndex: 0, type: "text_contains", expected: "Invoice sent" },
        { stepIndex: 1, type: "text_contains", expected: "Something the page never said" },
        null,
      ] }),
      usage: { inputTokens: 1, outputTokens: 1 }, model: "cheap-model", stopReason: null,
    });

    const derived = await deriveAssertions([
      { stepIndex: 0, action: "Send", expected: "Invoice is sent", snapshot: snap(0, "Invoice sent to Ada") },
      { stepIndex: 1, action: "Open", expected: "Details open", snapshot: snap(1, "Details") },
      { stepIndex: 2, action: "Close", expected: "Closed", snapshot: snap(2, "Bye") },
    ], billing);

    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][0].model).toBe("cheap-model");
    expect(Array.from(derived.entries())).toEqual([[0, { type: "text_contains", expected: "Invoice sent" }]]);
  });

  it("returns nothing on unparseable output", async () => {
    llm.mockResolvedValue({ content: "not json at all {", usage: { inputTokens: 1, outputTokens: 1 }, model: "m", stopReason: null });
    const derived = await deriveAssertions([{ stepIndex: 0, action: "a", expected: "b", snapshot: snap(0, "x") }], billing);
    expect(derived.size).toBe(0);
  });
});

describe("assertionHoldsOnSnapshot", () => {
  const page = snap(0, "Welcome back, {{credential:TEST_EMAIL}}", "https://s.example.com/projects/1/settings");

  it("checks text and URL assertions against the captured page", () => {
    expect(assertionHoldsOnSnapshot({ type: "text_contains", expected: "Welcome back" }, page)).toBe(true);
    expect(assertionHoldsOnSnapshot({ type: "visible", expected: "Welcome back" }, page)).toBe(true);
    expect(assertionHoldsOnSnapshot({ type: "url_matches", expected: "/settings" }, page)).toBe(true);
    expect(assertionHoldsOnSnapshot({ type: "text_contains", expected: "Goodbye" }, page)).toBe(false);
  });

  it("rejects trivial, credential-bearing and non-derivable assertions", () => {
    expect(assertionHoldsOnSnapshot({ type: "text_contains", expected: "We" }, page)).toBe(false);
    expect(assertionHoldsOnSnapshot({ type: "url_matches", expected: "/" }, page)).toBe(false);
    expect(assertionHoldsOnSnapshot({ type: "text_contains", expected: "{{credential:TEST_EMAIL}}" }, page)).toBe(false);
    expect(assertionHoldsOnSnapshot({ type: "element_count", expected: "3", selector: "li" }, page)).toBe(false);
  });
});
