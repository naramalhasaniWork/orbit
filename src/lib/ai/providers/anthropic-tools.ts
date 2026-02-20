/**
 * Anthropic tool-use streaming provider.
 * Extends the base anthropic provider with native tool calling support
 * for the Orbit Agent's agentic loop.
 */

import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// Types
// ============================================================

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

interface TextContent {
  type: "text";
  text: string;
}

interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

interface ConversationMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "message_complete"; usage: { inputTokens: number; outputTokens: number }; stopReason: string };

interface StreamWithToolsOptions {
  model: string;
  systemPrompt: string;
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

// ============================================================
// Client
// ============================================================

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

// ============================================================
// Streaming with Tools
// ============================================================

/**
 * Stream an Anthropic completion with tool-use support.
 * Yields text deltas and tool_use events as they arrive.
 * The caller is responsible for executing tools and feeding results back.
 */
export async function* streamWithTools(
  options: StreamWithToolsOptions
): AsyncGenerator<StreamEvent> {
  const {
    model,
    systemPrompt,
    messages,
    tools,
    maxTokens = 4096,
    temperature = 0.3,
  } = options;

  const client = getClient();

  // Format messages for Anthropic API
  const formattedMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Format tools for Anthropic API
  const formattedTools: Anthropic.Messages.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
  }));

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: formattedMessages,
    tools: formattedTools,
  });

  // Track current tool_use block being built
  let currentToolId: string | null = null;
  let currentToolName: string | null = null;
  let toolInputJson = "";

  for await (const event of stream) {
    switch (event.type) {
      case "content_block_start": {
        const block = event.content_block;
        if (block.type === "tool_use") {
          currentToolId = block.id;
          currentToolName = block.name;
          toolInputJson = "";
        }
        break;
      }

      case "content_block_delta": {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          toolInputJson += delta.partial_json;
        }
        break;
      }

      case "content_block_stop": {
        if (currentToolId && currentToolName) {
          let input: Record<string, unknown> = {};
          try {
            input = toolInputJson ? JSON.parse(toolInputJson) : {};
          } catch {
            // If JSON parsing fails, pass empty input
          }
          yield {
            type: "tool_use",
            id: currentToolId,
            name: currentToolName,
            input,
          };
          currentToolId = null;
          currentToolName = null;
          toolInputJson = "";
        }
        break;
      }

      case "message_stop":
        break;
    }
  }

  // Get final message for usage stats
  const finalMessage = await stream.finalMessage();

  yield {
    type: "message_complete",
    usage: {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    },
    stopReason: finalMessage.stop_reason ?? "end_turn",
  };
}

/**
 * Build a tool result message to feed back into the conversation.
 */
export function buildToolResultMessage(
  toolResults: Array<{ toolUseId: string; result: string }>
): ConversationMessage {
  return {
    role: "user",
    content: toolResults.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.toolUseId,
      content: r.result,
    })),
  };
}

/**
 * Build an assistant message containing tool_use blocks
 * (needed to maintain conversation history after tool calls).
 */
export function buildAssistantToolUseMessage(
  textParts: string[],
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>
): ConversationMessage {
  const content: ContentBlock[] = [];

  const combinedText = textParts.join("");
  if (combinedText) {
    content.push({ type: "text", text: combinedText });
  }

  for (const tool of toolUses) {
    content.push({
      type: "tool_use",
      id: tool.id,
      name: tool.name,
      input: tool.input,
    });
  }

  return { role: "assistant", content };
}

export type {
  ToolDefinition,
  ConversationMessage,
  StreamEvent,
  StreamWithToolsOptions,
  ContentBlock,
};
