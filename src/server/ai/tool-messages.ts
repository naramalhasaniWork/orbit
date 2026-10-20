// Conversation helpers for tool-use loops (the Orbit Agent).

import type { ChatMessage, ToolResultPart, ToolUsePart, TextPart } from "@/server/ai/types";

/** A user message carrying tool results back to the model. */
export function buildToolResultMessage(toolResults: Array<{ toolUseId: string; result: string }>): ChatMessage {
  return {
    role: "user",
    content: toolResults.map(
      (r): ToolResultPart => ({ type: "tool_result", tool_use_id: r.toolUseId, content: r.result })
    ),
  };
}

/** The assistant turn that requested tools, needed to keep the history valid. */
export function buildAssistantToolUseMessage(
  textParts: string[],
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>
): ChatMessage {
  const content: Array<TextPart | ToolUsePart> = [];
  const text = textParts.join("");
  if (text) content.push({ type: "text", text });
  for (const tool of toolUses) {
    content.push({ type: "tool_use", id: tool.id, name: tool.name, input: tool.input });
  }
  return { role: "assistant", content };
}
