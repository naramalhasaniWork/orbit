import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page } from "playwright";

vi.mock("@/lib/db", () => ({
  prisma: { project: { findUniqueOrThrow: vi.fn().mockResolvedValue({ workspaceId: "ws-1" }) } },
}));
vi.mock("@/services/mcp/tool-injector", () => ({
  getWorkspaceMcpTools: vi.fn(),
  formatToolsForPrompt: vi.fn(),
  executeToolCall: vi.fn(),
}));
vi.mock("@/services/execution/executor-decision", () => ({
  getNextAction: vi.fn(),
  createAgentModelState: vi.fn().mockResolvedValue({ primary: "m", escalation: null, escalated: false, divergences: 0 }),
}));
vi.mock("@/services/execution/browser-manager", () => ({
  getPageState: vi.fn().mockResolvedValue({
    url: "https://staging.example.com", title: "App", visibleText: "", interactiveElements: [],
  }),
}));
vi.mock("@/services/execution/action-executor", () => ({ executeAction: vi.fn() }));
vi.mock("@/services/execution/auth-detector", () => ({
  maybeSkipAuthSteps: vi.fn().mockResolvedValue({ skipCount: 0 }),
}));
vi.mock("@/services/execution/stagehand-adapter", () => ({ isStagehandEnabled: () => false }));
vi.mock("@/lib/websocket", () => ({ emitTestStep: vi.fn() }));
vi.mock("@/services/execution/screenshot-streamer", () => ({
  captureAndStream: vi.fn(), captureInitialState: vi.fn(), captureFailureState: vi.fn(),
}));

import { ExecutorActionSchema } from "@/agents/schemas/execution-result";
import {
  getWorkspaceMcpTools,
  formatToolsForPrompt,
  executeToolCall,
} from "@/services/mcp/tool-injector";
import { getNextAction } from "@/services/execution/executor-decision";
import { performToolCall, loadMcpToolSession } from "@/services/execution/mcp-tool-step";
import { executeTestSteps } from "@/services/execution/step-executor";
import type { EvidenceCollectorInstance } from "@/services/execution/evidence-collector";

const listTools = getWorkspaceMcpTools as ReturnType<typeof vi.fn>;
const formatTools = formatToolsForPrompt as ReturnType<typeof vi.fn>;
const callTool = executeToolCall as ReturnType<typeof vi.fn>;
const nextAction = getNextAction as ReturnType<typeof vi.fn>;

const session = { workspaceId: "ws-1", runId: "run-1", prompt: "## External MCP Tools" };
const toolAction = ExecutorActionSchema.parse({
  action: "tool_call", toolName: "read_inbox", toolArgs: { to: "qa@example.com" }, reason: "get code",
});

describe("tool_call action schema", () => {
  it("requires toolName", () => {
    expect(ExecutorActionSchema.safeParse({ action: "tool_call" }).success).toBe(false);
    expect(toolAction.toolArgs).toEqual({ to: "qa@example.com" });
  });
});

describe("performToolCall", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the tool and records the output as step evidence", async () => {
    callTool.mockResolvedValue({ success: true, output: "Code: 123456", connectionName: "Mailbox" });

    const { step, history } = await performToolCall(session, toolAction, 2, "Enter the code");

    expect(callTool).toHaveBeenCalledWith("ws-1", "read_inbox", { to: "qa@example.com" }, "run-1");
    expect(step).toMatchObject({
      stepIndex: 2, action: "tool_call read_inbox [Mailbox]", actual: "Code: 123456", status: "passed",
    });
    expect(history.result).toBe("Code: 123456");
  });

  it("records failures without throwing and truncates long output", async () => {
    callTool.mockResolvedValue({ success: false, output: "x".repeat(5000), connectionName: "Mailbox" });

    const { step } = await performToolCall(session, toolAction, 0, "");

    expect(step.status).toBe("failed");
    expect(step.actual.length).toBeLessThan(2100);
    expect(step.actual).toContain("(truncated)");
  });

  it("refuses when the workspace has no connected tools", async () => {
    const { step } = await performToolCall({ ...session, prompt: "" }, toolAction, 0, "");

    expect(callTool).not.toHaveBeenCalled();
    expect(step.actual).toContain("No MCP tools are connected");
  });

  it("degrades to no tools when MCP config cannot be loaded", async () => {
    listTools.mockRejectedValue(new Error("db down"));
    expect(await loadMcpToolSession("ws-1")).toMatchObject({ prompt: "" });
  });
});

describe("executeTestSteps with MCP tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers the tools to the agent and logs a tool call without advancing the step", async () => {
    listTools.mockResolvedValue([{ name: "read_inbox" }]);
    formatTools.mockReturnValue("## External MCP Tools\n- read_inbox");
    callTool.mockResolvedValue({ success: true, output: "Code: 123456", connectionName: "Mailbox" });
    nextAction
      .mockResolvedValueOnce(toolAction)
      .mockResolvedValueOnce({ action: "verdict", verdict: "pass", reason: "done" });

    const evidence = { captureScreenshot: vi.fn(), captureDomSnapshot: vi.fn() };
    const result = await executeTestSteps({
      page: {} as Page,
      projectId: "p1",
      testCaseId: "tc-1",
      testCaseName: "Verify email",
      runId: "run-1",
      steps: [{ action: "Enter the emailed code", expected: "Account verified" }],
      credentials: {},
      evidenceCollector: evidence as unknown as EvidenceCollectorInstance,
    });

    expect(nextAction.mock.calls[0][0].mcpToolsPrompt).toContain("read_inbox");
    // Second decision sees the tool result and is still on step 0
    expect(nextAction.mock.calls[1][0].currentStepIndex).toBe(0);
    expect(nextAction.mock.calls[1][0].previousActions[0].result).toBe("Code: 123456");
    expect(result.verdict).toBe("pass");
    expect(result.steps[0].action).toBe("tool_call read_inbox [Mailbox]");
  });
});
