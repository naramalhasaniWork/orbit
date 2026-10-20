import Anthropic from "@anthropic-ai/sdk";
import { getModelSpec } from "@/server/ai/model-catalog";
import { ProviderError, parseRetryAfter } from "@/server/ai/errors";
import type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatResult,
  TextPart,
  ToolChatRequest,
  ToolStreamEvent,
  Usage,
} from "@/server/ai/types";

type Params = Anthropic.MessageCreateParamsNonStreaming;

const DEFAULT_MAX_TOKENS = 4096;

function textBlock(part: TextPart): Anthropic.TextBlockParam {
  return part.cache
    ? { type: "text", text: part.text, cache_control: { type: "ephemeral" } }
    : { type: "text", text: part.text };
}

function toMessage(m: ChatMessage): Anthropic.MessageParam {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  const content: Anthropic.ContentBlockParam[] = m.content.map((part) => {
    switch (part.type) {
      case "text":
        return textBlock(part);
      case "image":
        return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
      case "tool_use":
        return { type: "tool_use", id: part.id, name: part.name, input: part.input };
      case "tool_result":
        return { type: "tool_result", tool_use_id: part.tool_use_id, content: part.content };
    }
  });
  return { role: m.role, content };
}

/** Builds the request body. Exported so tests can assert the cached-prefix layout. */
export function buildAnthropicParams(req: ChatRequest): Params {
  const spec = getModelSpec(req.model);
  const params: Params = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: typeof req.system === "string" ? req.system : req.system.map(textBlock),
    messages: req.messages.map(toMessage),
  };
  // Unknown Claude ids are assumed current-generation: no sampling params.
  if (req.temperature !== undefined && spec?.acceptsSampling) params.temperature = req.temperature;
  if (spec?.thinkingOff) params.thinking = { type: spec.thinkingOff };
  const outputConfig: Anthropic.OutputConfig = {};
  if (spec && spec.thinkingOff === null) outputConfig.effort = "low";
  if (req.responseSchema && spec?.supportsStructuredOutput) {
    outputConfig.format = { type: "json_schema", schema: req.responseSchema };
  }
  if (Object.keys(outputConfig).length > 0) params.output_config = outputConfig;
  return params;
}

function toUsage(u: Anthropic.Usage): Usage {
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheCreation = u.cache_creation_input_tokens ?? 0;
  // Anthropic reports uncached input separately; Usage.inputTokens is the full prompt.
  return {
    inputTokens: u.input_tokens + cacheRead + cacheCreation,
    outputTokens: u.output_tokens,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
  };
}

function toProviderError(err: unknown): unknown {
  if (err instanceof Anthropic.APIError) {
    return new ProviderError("anthropic", err.message, {
      status: err.status,
      retryAfterMs: parseRetryAfter(err.headers?.get("retry-after")),
    });
  }
  return err;
}

function client(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new ProviderError("anthropic", "No Anthropic API key: set ANTHROPIC_API_KEY or add a workspace key", { retryable: false });
  }
  // The gateway owns retries.
  return new Anthropic({ apiKey: key, maxRetries: 0 });
}

function firstText(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block?.text ?? "";
}

async function complete(req: ChatRequest): Promise<ChatResult> {
  try {
    // Streaming avoids the SDK's non-streaming timeout guard on large max_tokens.
    const message = await client(req.apiKey).messages.stream(buildAnthropicParams(req)).finalMessage();
    return {
      content: firstText(message.content),
      usage: toUsage(message.usage),
      model: message.model,
      stopReason: message.stop_reason,
    };
  } catch (err) {
    throw toProviderError(err);
  }
}

async function* stream(req: ChatRequest): AsyncGenerator<string, ChatResult> {
  try {
    const s = client(req.apiKey).messages.stream(buildAnthropicParams(req));
    let content = "";
    for await (const event of s) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        content += event.delta.text;
        yield event.delta.text;
      }
    }
    const message = await s.finalMessage();
    return { content, usage: toUsage(message.usage), model: message.model, stopReason: message.stop_reason };
  } catch (err) {
    throw toProviderError(err);
  }
}

async function* streamWithTools(req: ToolChatRequest): AsyncGenerator<ToolStreamEvent> {
  try {
    const s = client(req.apiKey).messages.stream({
      ...buildAnthropicParams(req),
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      })),
    });
    for await (const event of s) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text_delta", text: event.delta.text };
      }
    }
    const message = await s.finalMessage();
    for (const block of message.content) {
      if (block.type === "tool_use") {
        yield { type: "tool_use", id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> };
      }
    }
    yield {
      type: "message_complete",
      usage: toUsage(message.usage),
      stopReason: message.stop_reason ?? "end_turn",
      model: message.model,
    };
  } catch (err) {
    throw toProviderError(err);
  }
}

export const anthropicProvider: ChatProvider = { name: "anthropic", complete, stream, streamWithTools };
