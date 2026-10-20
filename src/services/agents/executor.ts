/**
 * Sub-Agent Executor — spawns and runs sub-agents with context windowing.
 * Parent agents call spawnSubAgent() to delegate specialized tasks to
 * lightweight, focused sub-agents (e.g. selector-finder, api-validator).
 */

import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getSubAgentDef } from "@/services/agents/registry";
import { windowContext, estimateContextTokens } from "@/services/agents/context-window";
import { credentialPlaceholder, redactCredentials } from "@/lib/utils/credentials";
import { buildSubAgentPrompt } from "@/services/agents/prompt-router";

export interface SubAgentInput {
  /** Run ID of the parent agent for tracing */
  parentRunId: string;
  /** Trace ID from the parent for correlation */
  parentTraceId?: string;
  /** Project being tested */
  projectId: string;
  /** Which sub-agent to spawn */
  agentType: string;
  /** Context to pass to the sub-agent */
  context: Record<string, unknown>;
  /** Override the max output tokens (optional) */
  maxTokens?: number;
  /** Workspace ID for billing */
  workspaceId: string;
}

export interface SubAgentResult {
  /** Whether the sub-agent completed successfully */
  success: boolean;
  /** Parsed output from the sub-agent */
  output: unknown;
  /** Token usage for billing */
  tokensUsed: { input: number; output: number };
  /** Wall-clock duration */
  durationMs: number;
  /** Trace ID for this sub-agent invocation */
  traceId: string;
}

/**
 * Generate a trace ID for a sub-agent invocation.
 */
function generateTraceId(parentTraceId: string | undefined, agentType: string): string {
  const base = parentTraceId ?? `trace-${Date.now()}`;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}:sub-${agentType}-${suffix}`;
}

/**
 * Parse JSON from an LLM response, handling markdown code fences.
 */
function parseJsonResponse(content: string): unknown {
  const cleaned = content
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Spawn a sub-agent to handle a specialized task.
 *
 * Flow:
 * 1. Look up the sub-agent definition from the registry
 * 2. Apply context windowing to fit within token budget
 * 3. Build a prompt using the sub-agent's prompt builder
 * 4. Call createTrackedCompletion with the sub-agent's model
 * 5. Parse the structured JSON output
 * 6. Return the result with tracing metadata
 */
export async function spawnSubAgent(input: SubAgentInput): Promise<SubAgentResult> {
  const startTime = Date.now();
  const {
    parentRunId,
    parentTraceId,
    projectId,
    agentType,
    context,
    maxTokens: maxTokensOverride,
    workspaceId,
  } = input;

  const traceId = generateTraceId(parentTraceId, agentType);

  // Step 1: Look up the sub-agent definition
  const definition = getSubAgentDef(agentType);
  if (!definition) {
    console.error(`[SubAgent] Unknown agent type: ${agentType}`);
    return {
      success: false,
      output: { error: `Unknown sub-agent type: ${agentType}` },
      tokensUsed: { input: 0, output: 0 },
      durationMs: Date.now() - startTime,
      traceId,
    };
  }

  const maxOutputTokens = maxTokensOverride ?? definition.maxTokens;

  console.log(
    `[SubAgent] Spawning ${agentType} (model: ${definition.defaultModel}, ` +
    `maxTokens: ${maxOutputTokens}, parent: ${parentRunId}, trace: ${traceId})`
  );

  // Step 2: Apply context windowing
  const contextTokenBudget = estimateContextBudget(definition.defaultModel);
  const windowedContext = applyContextWindowing(
    context,
    agentType,
    contextTokenBudget
  );

  // Step 3: Build the prompt
  const systemPrompt = buildSubAgentPrompt(agentType, windowedContext);
  if (!systemPrompt) {
    console.error(`[SubAgent] No prompt builder for type: ${agentType}`);
    return {
      success: false,
      output: { error: `No prompt builder for sub-agent type: ${agentType}` },
      tokensUsed: { input: 0, output: 0 },
      durationMs: Date.now() - startTime,
      traceId,
    };
  }

  // Step 4: Call the LLM
  try {
    const result = await createTrackedCompletion(
      {
        model: definition.defaultModel,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: buildUserMessage(agentType, windowedContext),
          },
        ],
        maxTokens: maxOutputTokens,
        temperature: 0,
      },
      {
        workspaceId,
        projectId,
        runId: parentRunId,
        agentPhase: definition.agentPhase,
      }
    );

    // Step 5: Parse the output
    const parsed = parseJsonResponse(result.content);

    console.log(
      `[SubAgent] ${agentType} completed in ${Date.now() - startTime}ms ` +
      `(tokens: ${result.usage.inputTokens}+${result.usage.outputTokens})`
    );

    return {
      success: true,
      output: parsed,
      tokensUsed: {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      },
      durationMs: Date.now() - startTime,
      traceId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SubAgent] ${agentType} failed:`, errorMessage);

    return {
      success: false,
      output: { error: errorMessage },
      tokensUsed: { input: 0, output: 0 },
      durationMs: Date.now() - startTime,
      traceId,
    };
  }
}

/**
 * Estimate the context token budget based on the model's context window.
 * Reserves space for the system prompt and output tokens.
 */
function estimateContextBudget(model: string): number {
  // Approximate model context windows (conservative estimates)
  const CONTEXT_WINDOWS: Record<string, number> = {
    "claude-haiku-4-5-20251001": 200000,
    "claude-sonnet-4-6": 200000,
    "claude-opus-4-6": 200000,
    "gpt-5.2": 400000,
    "gpt-4.1": 1047576,
    "o4-mini": 200000,
  };

  const contextWindow = CONTEXT_WINDOWS[model] ?? 100000;
  // Reserve 30% for system prompt + output
  return Math.floor(contextWindow * 0.7);
}

/**
 * Apply context windowing with sub-agent-specific priority fields.
 */
function applyContextWindowing(
  context: Record<string, unknown>,
  agentType: string,
  maxTokens: number
): Record<string, unknown> {
  const contextSize = estimateContextTokens(context);
  if (contextSize <= maxTokens) return context;

  const priorities = getContextPriorities(agentType);

  return windowContext(context, {
    maxTokens,
    priorityFields: priorities.high,
    summaryFields: priorities.medium,
  });
}

/**
 * Define which context fields are high/medium priority per sub-agent type.
 */
function getContextPriorities(agentType: string): {
  high: string[];
  medium: string[];
} {
  const PRIORITIES: Record<string, { high: string[]; medium: string[] }> = {
    "selector-finder": {
      high: ["originalSelector", "actionDescription", "interactiveElements"],
      medium: ["pageHtml", "failedSelectors"],
    },
    "api-validator": {
      high: ["endpoint", "method", "expectedStatus", "actualStatus", "actualBody"],
      medium: ["expectedSchema", "requestBody", "responseHeaders"],
    },
    "auth-specialist": {
      high: ["authType", "testCredentials", "interactiveElements", "expectedOutcome"],
      medium: ["pageHtml", "previousActions", "detectedAuthStrategy"],
    },
    "visual-analyzer": {
      high: ["screenshotDescription", "expectedAppearance", "expectedElements"],
      medium: ["baselineDescription", "brandGuidelines"],
    },
    "journey-analyzer": {
      high: ["journeyName", "nodes", "edges"],
      medium: ["failurePatterns", "existingTestNames"],
    },
    "code-reviewer": {
      high: ["files", "framework", "language"],
      medium: ["focusAreas", "knownPatterns"],
    },
  };

  return PRIORITIES[agentType] ?? { high: [], medium: [] };
}

/**
 * Serialize context for the model with secret values replaced by credential
 * placeholders ({{credential:KEY}}); the real values stay server-side.
 */
function withoutCredentialValues(context: Record<string, unknown>): string {
  const raw = context.testCredentials;
  const credentials =
    raw && typeof raw === "object"
      ? (Object.fromEntries(
          Object.entries(raw).filter(([, v]) => typeof v === "string")
        ) as Record<string, string>)
      : undefined;
  if (!credentials) return JSON.stringify(context, null, 2);

  const placeholders = Object.fromEntries(
    Object.keys(credentials).map((key) => [key, credentialPlaceholder(key)])
  );
  return redactCredentials(
    JSON.stringify({ ...context, testCredentials: placeholders }, null, 2),
    credentials
  );
}

/**
 * Build the user message for the sub-agent based on its type.
 */
function buildUserMessage(
  agentType: string,
  context: Record<string, unknown>
): string {
  const contextSummary = Object.keys(context)
    .map((key) => `- ${key}`)
    .join("\n");
  const safeContext = withoutCredentialValues(context);

  return (
    `Execute your task as the ${agentType} sub-agent. ` +
    `Context fields provided:\n${contextSummary}\n\n` +
    `Full context:\n${safeContext}\n\n` +
    `Output valid JSON only. Follow the output schema exactly.`
  );
}
