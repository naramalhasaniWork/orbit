/**
 * Orbit Agent Runner — the agentic loop that processes user messages.
 * Streams text + tool activity back via an async generator.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { streamWithTools } from "@/server/ai/gateway";
import { buildToolResultMessage, buildAssistantToolUseMessage } from "@/server/ai/tool-messages";
import { modelForTier } from "@/server/ai/model-catalog";
import type { ChatMessage as ConversationMessage } from "@/server/ai/types";
import { ORBIT_TOOLS, executeTool, type ToolContext } from "./tools";
import { buildOrbitAgentPrompt } from "./prompt";
import { describeEnvironments, listProjectEnvironments } from "./environments";
import { getProjectContext } from "@/services/orchestrator/context-manager";
import { getMemorySnapshot } from "@/services/orchestrator/agent-memory";

// ============================================================
// Types
// ============================================================

type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

interface RunOrbitAgentInput {
  projectId: string;
  workspaceId: string;
  userId: string;
  conversationId: string;
  userMessage: string;
}

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_MESSAGES = 20;

// ============================================================
// Runner
// ============================================================

/**
 * Run the Orbit Agent loop.
 * Streams events as the agent generates text and calls tools.
 */
export async function* runOrbitAgent(
  input: RunOrbitAgentInput
): AsyncGenerator<AgentStreamEvent> {
  const { projectId, workspaceId, userId, conversationId, userMessage } = input;

  try {
    // 1. Load project context + memory
    const [context, memory, environments] = await Promise.all([
      getProjectContext(projectId),
      getMemorySnapshot(projectId, 5),
      listProjectEnvironments(projectId, workspaceId),
    ]);

    // 2. Build system prompt
    const systemPrompt = buildOrbitAgentPrompt({
      project: {
        name: context.project.name,
        framework: context.project.framework,
        lastIndexedAt: context.project.lastIndexedAt,
        lastRunAt: context.project.lastRunAt,
        healthStatus: context.project.healthStatus,
        systemMapStats: context.systemMapStats,
        activePlan: context.activePlan,
        lastRun: context.lastRun,
        environments: describeEnvironments(environments),
      },
      memory,
    });

    // 3. Load conversation history
    const history = await loadHistory(conversationId);

    // 4. Build messages array
    const messages: ConversationMessage[] = [
      ...history,
      { role: "user", content: userMessage },
    ];

    // 5. Tool context for tool execution
    const toolCtx: ToolContext = { projectId, workspaceId, userId };

    // 6. Agentic loop — call LLM, execute tools, feed results back
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const textParts: string[] = [];
      const pendingToolCalls: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];
      let stopReason = "end_turn";

      for await (const event of streamWithTools(
        {
          model: modelForTier("balanced"),
          system: systemPrompt,
          messages,
          tools: ORBIT_TOOLS,
          maxTokens: 4096,
          temperature: 0.3,
        },
        // The assistant has no phase of its own; its spend is reported under reporter.
        { workspaceId, projectId, agentPhase: "reporter" }
      )) {
        switch (event.type) {
          case "text_delta":
            textParts.push(event.text);
            yield { type: "text_delta", text: event.text };
            break;

          case "tool_use":
            pendingToolCalls.push({
              id: event.id,
              name: event.name,
              input: event.input,
            });
            yield {
              type: "tool_call",
              name: event.name,
              args: event.input,
            };
            break;

          case "message_complete":
            totalInputTokens += event.usage.inputTokens;
            totalOutputTokens += event.usage.outputTokens;
            stopReason = event.stopReason;
            break;
        }
      }

      // If no tool calls, we're done
      if (pendingToolCalls.length === 0 || stopReason === "end_turn") {
        break;
      }

      // Execute tools and build result messages
      const assistantMsg = buildAssistantToolUseMessage(textParts, pendingToolCalls);
      messages.push(assistantMsg);

      const toolResults: Array<{ toolUseId: string; result: string }> = [];

      for (const call of pendingToolCalls) {
        const result = await executeTool(call.name, call.input, toolCtx);
        toolResults.push({ toolUseId: call.id, result });
        yield { type: "tool_result", name: call.name, result };
      }

      const toolResultMsg = buildToolResultMessage(toolResults);
      messages.push(toolResultMsg);

      // Continue loop — LLM will process tool results
    }

    yield {
      type: "done",
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };
  } catch (error) {
    console.error("Orbit agent error:", error);
    const message = sanitizeAgentError(error);
    yield { type: "error", message };
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Load the last N messages from a conversation as ConversationMessages.
 */
async function loadHistory(
  conversationId: string
): Promise<ConversationMessage[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY_MESSAGES,
    select: {
      role: true,
      content: true,
      toolName: true,
      toolArgs: true,
      toolResult: true,
    },
  });

  const result: ConversationMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      result.push({ role: "assistant", content: msg.content });
    }
    // tool_call and tool_result messages are embedded in the assistant/user
    // content blocks by the agentic loop, so we skip them in history replay
    // to keep things simple and avoid format issues.
  }

  return result;
}

/**
 * Save the full assistant response (text + tool calls) as messages.
 */
export async function saveAssistantResponse(
  conversationId: string,
  text: string,
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>
): Promise<void> {
  const creates: Prisma.MessageCreateManyInput[] = [];

  // Save tool call/result pairs
  for (const call of toolCalls) {
    creates.push({
      conversationId,
      role: "tool_call",
      content: `Called ${call.name}`,
      toolName: call.name,
      toolArgs: call.args as Prisma.InputJsonValue,
      metadata: {},
    });
    creates.push({
      conversationId,
      role: "tool_result",
      content: call.result.slice(0, 10000), // Truncate large results
      toolName: call.name,
      toolResult: safeJsonParse(call.result) as Prisma.InputJsonValue,
      metadata: {},
    });
  }

  // Save the final text response
  if (text) {
    creates.push({
      conversationId,
      role: "assistant",
      content: text,
      metadata: {},
    });
  }

  if (creates.length > 0) {
    await prisma.message.createMany({ data: creates });
  }
}

function safeJsonParse(str: string): Prisma.InputJsonValue | null {
  try {
    return JSON.parse(str) as Prisma.InputJsonValue;
  } catch {
    return null;
  }
}

/** Sanitize error messages to avoid leaking internal details to clients. */
function sanitizeAgentError(error: unknown): string {
  if (!(error instanceof Error)) return "Agent execution failed";

  const safePatterns = [
    /rate.*limit/i,
    /token.*budget/i,
    /context.*too.*long/i,
    /model.*not.*available/i,
    /tool.*execution.*failed/i,
    /no.*system.*map/i,
    /project.*not.*found/i,
  ];

  if (safePatterns.some((p) => p.test(error.message))) {
    return error.message;
  }

  return "Agent execution failed. Please try again.";
}

export type { AgentStreamEvent, RunOrbitAgentInput };
