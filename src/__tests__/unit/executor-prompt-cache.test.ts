import { describe, it, expect, vi, beforeEach } from "vitest";

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { agentConfig: { findUnique: vi.fn().mockResolvedValue(null) } } }));
vi.mock("@/server/ai/gateway", () => ({ complete: completeMock }));

import { buildAnthropicParams } from "@/server/ai/providers/anthropic";
import {
  buildExecutorRequest,
  getNextAction,
  type AgentModelState,
} from "@/services/execution/executor-decision";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";

const SECRETS = { TEST_EMAIL: "qa@acme.test", TEST_PASSWORD: "hunter2-secret" };

function ctx(overrides: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    testCaseId: "tc-1",
    testCaseName: "Checkout works",
    currentStepIndex: 0,
    steps: [
      { action: "Log in", expected: "Dashboard" },
      { action: "Open the cart", expected: "Cart is visible", selectorHint: "#cart" },
      { action: "Pay", expected: "Receipt" },
    ],
    pageState: { url: "https://staging.acme.test/login", title: "Sign in", visibleText: "Sign in", interactiveElements: [] },
    screenshotDescription: "Step 1 of 3",
    previousActions: [],
    testCredentials: SECRETS,
    testingNotes: [{ category: "context", content: "Cart lives in the header" }],
    ...overrides,
  };
}

const laterTurn = ctx({
  currentStepIndex: 2,
  pageState: {
    url: "https://staging.acme.test/cart",
    title: "Cart",
    visibleText: "2 items",
    interactiveElements: [{ tag: "button", text: "Pay", selector: "#pay" }],
  },
  screenshotDescription: "Step 3 of 3",
  previousActions: [{ action: "click #cart", result: "Cart opened" }],
});

describe("executor prompt caching layout", () => {
  it("keeps the cached prefix byte-identical across calls within a test case", () => {
    const first = buildAnthropicParams(buildExecutorRequest(ctx(), "claude-haiku-5-5"));
    const second = buildAnthropicParams(buildExecutorRequest(laterTurn, "claude-haiku-5-5"));

    expect(JSON.stringify(second.system)).toBe(JSON.stringify(first.system));
    expect(JSON.stringify(second.output_config)).toBe(JSON.stringify(first.output_config));
    expect(second.messages).not.toEqual(first.messages);
  });

  it("puts [rules] and [test case] behind cache breakpoints and the turn in the user message", () => {
    const params = buildAnthropicParams(buildExecutorRequest(laterTurn, "claude-haiku-5-5"));
    const system = params.system as Array<{ text: string; cache_control?: { type: string } }>;

    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toContain("## Output Schema");
    expect(system[0].text).not.toContain("Checkout works");
    expect(system[1].text).toContain("Checkout works");
    expect(system[1].text).toContain("{{credential:TEST_PASSWORD}}");
    expect(system[1].text).not.toContain("<-- CURRENT");

    const turn = params.messages[0].content as string;
    expect(turn).toContain("Step 3 of 3 is CURRENT");
    expect(turn).toContain("https://staging.acme.test/cart");
    expect(turn).toContain("click #cart");
    for (const value of Object.values(SECRETS)) expect(JSON.stringify(params)).not.toContain(value);
  });

  it("uses structured outputs and no sampling params on current models", () => {
    const params = buildAnthropicParams(buildExecutorRequest(ctx(), "claude-haiku-5-5"));
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.temperature).toBeUndefined();
    expect(params.thinking).toEqual({ type: "disabled" });

    const withTools = buildAnthropicParams(buildExecutorRequest(ctx({ mcpToolsPrompt: "## MCP Tools\n- read_inbox" }), "claude-haiku-5-5"));
    expect(withTools.output_config?.format).toBeUndefined();
  });

  it("skips a breakpoint whose prefix is below the model's cacheable minimum", () => {
    // Haiku 4.5 caches only prefixes of 4096+ tokens; the rules block alone is shorter.
    const params = buildAnthropicParams(buildExecutorRequest(ctx(), "claude-haiku-4-5"));
    const system = params.system as Array<{ cache_control?: unknown }>;
    expect(system[0].cache_control).toBeUndefined();
  });
});

describe("executor model escalation", () => {
  const billing = { workspaceId: "11111111-1111-4111-8111-111111111111", projectId: "p" };
  const reply = (content: string) => ({ content, usage: {}, model: "m", stopReason: "end_turn" });
  const state = (): AgentModelState => ({ primary: "claude-haiku-5-5", escalation: "claude-sonnet-5-5", escalated: false, divergences: 0 });

  beforeEach(() => completeMock.mockReset());

  it("retries an unparseable action once on the cheap model", async () => {
    const s = state();
    completeMock.mockResolvedValueOnce(reply("not json")).mockResolvedValueOnce(reply('{"action":"wait","waitMs":500,"reason":"loading"}'));

    const action = await getNextAction(ctx(), billing, s);

    expect(action.action).toBe("wait");
    expect(completeMock.mock.calls.map((c) => c[0].model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(s).toMatchObject({ divergences: 1, escalated: false });
  });

  it("escalates on the second divergence and asks the stronger model", async () => {
    const s = state();
    s.divergences = 1;
    const repeat = '{"action":"click","selector":"#cart","reason":"open cart"}';
    completeMock.mockResolvedValueOnce(reply(repeat)).mockResolvedValueOnce(reply('{"action":"click","selector":"#pay","reason":"pay"}'));

    const action = await getNextAction(laterTurn, billing, s);

    expect(action.selector).toBe("#pay");
    expect(completeMock.mock.calls.map((c) => c[0].model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(s.escalated).toBe(true);
  });

  it("never escalates a pinned model", async () => {
    const s: AgentModelState = { primary: "claude-opus-5-5", escalation: null, escalated: false, divergences: 5 };
    completeMock.mockResolvedValue(reply("garbage"));
    await expect(getNextAction(ctx(), billing, s)).rejects.toThrow("invalid action 2 times");
    expect(completeMock.mock.calls.every((c) => c[0].model === "claude-opus-5-5")).toBe(true);
  });
});
