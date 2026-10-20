import type { ExecutorAction, StepResult } from "@/agents/schemas/execution-result";
import {
  getWorkspaceMcpTools,
  formatToolsForPrompt,
  executeToolCall,
} from "@/services/mcp/tool-injector";

// Lets the executor call tools from the workspace's connected MCP servers
// mid-test (e.g. read a verification email, seed a record). Only active
// connections are offered; tool-injector enforces the per-run call limit
// and writes the audit log.

/** Cap on tool output kept as step evidence and fed back to the agent. */
const MAX_TOOL_OUTPUT_CHARS = 2000;

export interface McpToolSession {
  workspaceId: string;
  runId?: string;
  /** Prompt section describing the tools; empty when none are connected. */
  prompt: string;
}

export async function loadMcpToolSession(
  workspaceId: string,
  runId?: string
): Promise<McpToolSession> {
  try {
    const tools = await getWorkspaceMcpTools(workspaceId);
    return { workspaceId, runId, prompt: formatToolsForPrompt(tools) };
  } catch (err) {
    // A broken MCP config must not stop browser testing
    console.warn("[McpToolStep] Could not load MCP tools:", err);
    return { workspaceId, runId, prompt: "" };
  }
}

interface ToolStepOutcome {
  step: StepResult;
  history: { action: string; result: string };
}

/**
 * Run a tool_call action and record it as step evidence. A failed call does
 * not fail the test: the agent sees the error and decides what to do next.
 */
export async function performToolCall(
  session: McpToolSession,
  action: ExecutorAction,
  stepIndex: number,
  expected: string
): Promise<ToolStepOutcome> {
  const toolName = action.toolName ?? "";
  const started = Date.now();

  const result = session.prompt
    ? await executeToolCall(session.workspaceId, toolName, action.toolArgs ?? {}, session.runId)
    : { success: false, output: "No MCP tools are connected for this workspace", connectionName: "none" };

  const output = truncate(result.output);
  const label = `tool_call ${toolName} [${result.connectionName}]`;
  return {
    step: {
      stepIndex,
      action: label,
      expected,
      actual: result.success ? output : `Tool call failed: ${output}`,
      status: result.success ? "passed" : "failed",
      durationMs: Date.now() - started,
    },
    history: { action: label, result: output },
  };
}

function truncate(text: string): string {
  return text.length > MAX_TOOL_OUTPUT_CHARS
    ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}… (truncated)`
    : text;
}
