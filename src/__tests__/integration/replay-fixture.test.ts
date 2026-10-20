import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { findChromium } from "../helpers/chromium";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";

// End-to-end compile-and-replay against a deterministic fixture app, in a
// real local chromium. The agent's model decisions are scripted (the LLM is
// the one thing faked); everything else — recording, compile, replay,
// divergence hand-off — is the production code path via the dispatcher.

const fixture = vi.hoisted(() => ({
  browser: null as Browser | null,
  agentCalls: 0,
  deriveCalls: 0,
  deriveNothing: false,
  scripts: [] as Array<Record<string, unknown> & { id: string; version: number; status: string; actions: unknown[] }>,
}));

vi.mock("@/services/execution/browser-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/execution/browser-manager")>();
  return {
    ...actual,
    launchBrowser: async (options: { storageState?: unknown } = {}) => {
      const context = await fixture.browser!.newContext({
        viewport: { width: 1280, height: 720 },
        ...(options.storageState ? { storageState: options.storageState as never } : {}),
      });
      return { browser: fixture.browser!, context, page: await context.newPage(), isRemote: true };
    },
    closeBrowser: async (instance: { context: { close(): Promise<void> } }) => instance.context.close(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUniqueOrThrow: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }) },
    selectorMapping: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/websocket", () => ({ emitTestStep: vi.fn() }));
vi.mock("@/lib/system-config", () => ({ getFlag: vi.fn().mockResolvedValue(false) }));
vi.mock("@/agents/prompts/context-loader", () => ({ loadTestingNotes: vi.fn().mockResolvedValue([]) }));
vi.mock("@/agents/prompts/sub-agents/visual-analyzer", () => ({ analyzeVisualQuality: vi.fn() }));
vi.mock("@/services/execution/flaky-registry", () => ({ detectFlakyFromRetry: vi.fn().mockResolvedValue(false) }));
vi.mock("@/services/execution/mcp-tool-step", () => ({
  loadMcpToolSession: vi.fn().mockResolvedValue({ workspaceId: "ws-1", prompt: "" }),
  performToolCall: vi.fn(),
}));
vi.mock("@/services/execution/screenshot-streamer", () => ({
  captureAndStream: vi.fn(), captureInitialState: vi.fn(), captureFailureState: vi.fn(),
}));
vi.mock("@/services/execution/evidence-collector", () => ({
  createEvidenceCollector: () => ({
    startCapture() {}, stopCapture() {},
    captureScreenshot: async () => "", captureDomSnapshot: async () => "",
    finalizeVideo: async () => undefined,
    getEvidence: () => ({ screenshots: [], networkLog: [], consoleLog: [] }),
  }),
  saveNetworkLog: vi.fn(), saveConsoleLog: vi.fn(),
}));

// The scripted agent: one model call per decision, picking the submit
// button by whatever id the page currently has.
vi.mock("@/services/execution/executor-decision", async () => {
  const { meterModelCall } = await import("@/server/ai/model-meter");
  return {
    createAgentModelState: async () => ({}),
    getNextAction: async (ctx: { currentStepIndex: number; pageState: { interactiveElements: Array<{ selector: string }> } }) => {
      fixture.agentCalls++;
      meterModelCall(0.004);
      const selectors = ctx.pageState.interactiveElements.map((e) => e.selector);
      switch (ctx.currentStepIndex) {
        case 0: return { action: "fill", selector: "#email", value: "{{credential:TEST_EMAIL}}" };
        case 1: return { action: "fill", selector: "#password", value: "{{credential:TEST_PASSWORD}}" };
        case 2: return { action: "click", selector: selectors.includes("#login-btn") ? "#login-btn" : "#signin" };
        default: return { action: "assert", assertion: { type: "text_contains", expected: "Welcome back" } };
      }
    },
  };
});

// The cheap assertion model: proposes an assertion per step from the captured page.
vi.mock("@/lib/ai/tracked-completion", async () => {
  const { meterModelCall } = await import("@/server/ai/model-meter");
  return {
    createTrackedCompletion: async (options: { messages: Array<{ content: string }> }) => {
      fixture.deriveCalls++;
      meterModelCall(0.001);
      const steps = JSON.parse(options.messages[0].content) as Array<{ stepIndex: number; url: string; pageText: string }>;
      const assertions = fixture.deriveNothing ? [] : steps.map((s) => (
        s.url.endsWith("/dashboard")
          ? { stepIndex: s.stepIndex, type: "url_matches", expected: "/dashboard" }
          : { stepIndex: s.stepIndex, type: "visible", expected: s.stepIndex === 0 ? "Email" : "Password" }
      ));
      return { content: JSON.stringify({ assertions }), usage: { inputTokens: 500, outputTokens: 40 }, model: "cheap-model", stopReason: null };
    },
  };
});

// In-memory script store with the production semantics (versions, retire on save).
vi.mock("@/server/engine/replay/script-store", () => ({
  findCurrentScript: async (testCaseId: string, envKey: string) => {
    const live = fixture.scripts
      .filter((s) => s.testCaseId === testCaseId && s.envKey === envKey && s.status !== "retired")
      .sort((a, b) => b.version - a.version)[0];
    return live ? { ...live, lastVerifiedByAgentAt: new Date() } : null;
  },
  saveScriptVersion: async (script: Record<string, unknown> & { actions: unknown[] }) => {
    for (const s of fixture.scripts) s.status = "retired";
    const version = fixture.scripts.length + 1;
    fixture.scripts.push({ ...script, id: `s${version}`, version, status: "active", actions: script.actions });
    return version;
  },
  recordReplay: vi.fn(), markVerifiedByAgent: vi.fn(), retireScript: vi.fn(),
  recentReplayDivergences: async () => [],
}));

import { executeCaseByType } from "@/services/execution/case-dispatcher";

const VALID_LOGIN = { TEST_EMAIL: "ada@example.com", TEST_PASSWORD: "hunter2-secret" } as const;
const SECRETS: Record<string, string> = { ...VALID_LOGIN };

function loginPage(mutated: boolean): string {
  const button = mutated
    ? `<button id="login-btn" data-testid="login" type="submit">Continue</button>`
    : `<button id="signin" data-testid="signin" type="submit">Sign in</button>`;
  return `<!doctype html><html><head><title>Fixture</title></head><body>
    <h1>Fixture app</h1>
    <form id="f">
      <label for="email">Email</label><input id="email" name="email" type="email">
      <label for="password">Password</label><input id="password" name="password" type="password">
      ${button}
    </form>
    <p id="err"></p>
    <script>
      document.getElementById("f").addEventListener("submit", (e) => {
        e.preventDefault();
        const ok = document.getElementById("email").value === "${VALID_LOGIN.TEST_EMAIL}"
          && document.getElementById("password").value === "${VALID_LOGIN.TEST_PASSWORD}";
        if (ok) location.href = "/dashboard";
        else document.getElementById("err").textContent = "Wrong email or password";
      });
    </script></body></html>`;
}
const DASHBOARD = `<!doctype html><html><head><title>Dashboard</title></head><body>
  <h1>Overview</h1><p>Welcome back, Ada</p></body></html>`;

const executablePath = findChromium();
let server: Server;
let baseUrl = "";
let mutated = false;
/** CF-Access-Client-Secret seen per request path, to prove replay sends Access headers */
const accessSeen: Array<[string, string | undefined]> = [];

const testCase = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Log in with valid credentials",
  type: "e2e",
  projectId: "22222222-2222-4222-8222-222222222222",
  isCritical: true,
  steps: [
    { action: "Enter the email", expected: "Email is entered" },
    { action: "Enter the password", expected: "Password is entered" },
    { action: "Click Sign in", expected: "The dashboard opens" },
    { action: "Check the greeting", expected: "Welcome back is shown" },
  ],
};

async function run(runId: string, credentials: Record<string, string> = SECRETS) {
  return executeCaseByType(runId, testCase, `${baseUrl}/login`, credentials, { environmentId: "env-1" });
}

describe.skipIf(!executablePath)("compile-and-replay on a fixture app", () => {
  beforeAll(async () => {
    fixture.browser = await chromium.launch({ headless: true, executablePath: executablePath! });
    server = createServer((req, res) => {
      accessSeen.push([req.url ?? "", req.headers["cf-access-client-secret"] as string | undefined]);
      res.setHeader("content-type", "text/html");
      res.end(req.url?.startsWith("/dashboard") ? DASHBOARD : loginPage(mutated));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await fixture.browser?.close();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // never sample a re-verify
    fixture.agentCalls = 0;
    fixture.deriveCalls = 0;
  });

  it("never compiles a script whose steps have no deterministic assertion", async () => {
    fixture.scripts.length = 0;
    fixture.deriveNothing = true;
    mutated = false;

    const result = await run("33333333-3333-4333-8333-333333333331");

    expect(result.verdict).toBe("pass");
    expect(fixture.deriveCalls).toBe(1);
    expect(fixture.scripts).toHaveLength(0);
    fixture.deriveNothing = false;
  }, 60_000);

  it("records an agent run, compiles it, then replays it with zero model calls", async () => {
    fixture.scripts.length = 0;
    mutated = false;

    const agentRun = await run("33333333-3333-4333-8333-333333333332");
    expect(agentRun.verdict).toBe("pass");
    expect(agentRun.execution).toMatchObject({ executionMode: "agent", modelCalls: 5 }); // 4 decisions + 1 derive
    expect(fixture.scripts).toHaveLength(1);

    const stored = JSON.stringify(fixture.scripts[0]);
    expect(stored).not.toContain(VALID_LOGIN.TEST_PASSWORD);
    expect(stored).not.toContain(VALID_LOGIN.TEST_EMAIL);
    expect(stored).toContain("{{credential:TEST_PASSWORD}}");
    const actions = fixture.scripts[0].actions as Array<{ action: string; locators?: Record<string, unknown>; post: { assertion?: unknown } }>;
    expect(actions.every((a) => a.post.assertion)).toBe(true);
    expect(actions[2].locators).toMatchObject({
      css: "#signin", role: { role: "button", name: "Sign in" }, testId: "signin", text: "Sign in",
    });

    fixture.agentCalls = 0;
    fixture.deriveCalls = 0;
    const replay = await run("33333333-3333-4333-8333-333333333333");

    expect(replay.verdict).toBe("pass");
    expect(replay.execution).toEqual({ executionMode: "replay", divergedAtStep: null, modelCalls: 0, modelCostUsd: 0 });
    expect(fixture.agentCalls).toBe(0);
    expect(fixture.deriveCalls).toBe(0);
    expect(replay.storageState?.cookies).toBeDefined();
  }, 90_000);

  it("diverges on a DOM change, lets the agent finish from that step, and writes script v2", async () => {
    expect(fixture.scripts).toHaveLength(1);
    mutated = true;

    const healed = await run("33333333-3333-4333-8333-333333333334");

    expect(healed.verdict).toBe("pass");
    expect(healed.execution).toMatchObject({ executionMode: "replay_healed", divergedAtStep: 2 });
    // The agent only decided the steps from the divergence on (click + assert), plus one derive for the new click
    expect(fixture.agentCalls).toBe(2);
    expect(healed.execution?.modelCalls).toBe(3);
    expect(fixture.scripts.map((s) => [s.version, s.status])).toEqual([[1, "retired"], [2, "active"]]);
    const v2 = fixture.scripts[1].actions as Array<{ locators?: { css?: string } }>;
    expect(v2[0].locators?.css).toBe("#email");
    expect(v2[2].locators?.css).toBe("#login-btn");

    fixture.agentCalls = 0;
    const replayV2 = await run("33333333-3333-4333-8333-333333333335");
    expect(replayV2.verdict).toBe("pass");
    expect(replayV2.execution).toMatchObject({ executionMode: "replay", modelCalls: 0 });
    expect(fixture.agentCalls).toBe(0);
  }, 120_000);

  it("fails the case when the app is broken and the agent can't finish either", async () => {
    mutated = true;
    SECRETS.TEST_PASSWORD = "wrong-password";
    try {
      const broken = await run("33333333-3333-4333-8333-333333333336");
      expect(broken.verdict).not.toBe("pass");
      expect(broken.execution).toMatchObject({ executionMode: "replay_healed", divergedAtStep: 2 });
    } finally {
      SECRETS.TEST_PASSWORD = VALID_LOGIN.TEST_PASSWORD;
    }
  }, 120_000);

  it("sends Cloudflare Access headers on replayed requests to the environment origin", async () => {
    mutated = true;
    accessSeen.length = 0;

    const replay = await run("33333333-3333-4333-8333-333333333337", {
      ...SECRETS, CF_ACCESS_CLIENT_ID: "id.access", CF_ACCESS_CLIENT_SECRET: "cf-s3cret",
    });

    expect(replay.execution).toMatchObject({ executionMode: "replay", modelCalls: 0 });
    expect(accessSeen.map(([path]) => path)).toEqual(["/login", "/dashboard"]);
    expect(accessSeen.every(([, secret]) => secret === "cf-s3cret")).toBe(true);
    expect(JSON.stringify(fixture.scripts)).not.toContain("cf-s3cret");
  }, 60_000);
});
