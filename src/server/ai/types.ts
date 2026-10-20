// Provider-neutral request/response shapes. Providers translate these to their wire formats;
// nothing outside src/server/ai/providers sees an SDK type.

export type AgentPhase = "analyst" | "planner" | "executor" | "reporter" | "auditor";

export interface TextPart {
  type: "text";
  text: string;
  /** Prompt-cache breakpoint after this block (Anthropic; ignored elsewhere). */
  cache?: boolean;
}

export interface ImagePart {
  type: "image";
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** base64 data, no data: prefix */
  data: string;
}

export type ContentPart = TextPart | ImagePart;

export interface ToolUsePart {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultPart {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<ContentPart | ToolUsePart | ToolResultPart>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  /** A plain string, or blocks when parts of the system prompt carry cache breakpoints. */
  system: string | TextPart[];
  messages: ChatMessage[];
  maxTokens?: number;
  /** Ignored on models that reject sampling parameters. */
  temperature?: number;
  /** JSON Schema the response must satisfy (structured outputs where supported). */
  responseSchema?: Record<string, unknown>;
  apiKey?: string;
}

export interface ToolChatRequest extends ChatRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ChatResult {
  content: string;
  usage: Usage;
  model: string;
  stopReason: string | null;
}

export type ToolStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "message_complete"; usage: Usage; stopReason: string; model: string };

export interface ChatProvider {
  readonly name: string;
  complete(req: ChatRequest): Promise<ChatResult>;
  stream(req: ChatRequest): AsyncGenerator<string, ChatResult>;
  streamWithTools?(req: ToolChatRequest): AsyncGenerator<ToolStreamEvent>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Who pays for a call. workspaceId may be a pseudo id ("system") for internal work. */
export interface CallContext {
  workspaceId: string;
  projectId?: string;
  runId?: string;
  agentPhase: AgentPhase;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};
