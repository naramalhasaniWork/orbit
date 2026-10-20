import { complete } from "@/server/ai/gateway";
import { getModelSpec } from "@/server/ai/model-catalog";
import type { ChatRequest } from "@/server/ai/types";
import { getAgentConfig, getAgentModels } from "@/lib/ai/model-router";
import { ExecutorActionSchema } from "@/agents/schemas/execution-result";
import type { ExecutorAction } from "@/agents/schemas/execution-result";
import { EXECUTOR_ACTION_JSON_SCHEMA } from "@/agents/schemas/executor-action-json-schema";
import { buildExecutorPrompt } from "@/agents/prompts/executor-prompt";
import type { ExecutorContext } from "@/agents/prompts/executor-prompt";
import { estimateTokens } from "@/agents/prompts/prompt-builder";
import { parseLlmJson } from "@/lib/utils/json-parse";

// The executor's per-action LLM decision: prompt -> parsed ExecutorAction.
// Retries on provider errors live in the AI gateway; this module only handles
// model choice and bad model output.

export interface BillingInfo {
  workspaceId: string;
  projectId: string;
  runId?: string;
}

/**
 * Model choice for one test case: start on the cheap model and switch to the
 * stronger one for the rest of the test after ESCALATE_AFTER divergences
 * (an unparseable action, or the same action repeated without progress).
 */
export interface AgentModelState {
  primary: string;
  escalation: string | null;
  escalated: boolean;
  divergences: number;
}

const ESCALATE_AFTER = 2;
const MAX_DECISION_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 500;
const NO_PROGRESS_EXEMPT = new Set(["wait", "screenshot", "scroll"]);

/** A workspace that picked an executor model in AgentConfig gets exactly that model. */
export async function createAgentModelState(workspaceId: string): Promise<AgentModelState> {
  const configured = await getAgentConfig(workspaceId, "executor").catch(() => null);
  const { primary, escalation } = configured?.model
    ? { primary: configured.model, escalation: null }
    : getAgentModels();
  return { primary, escalation, escalated: false, divergences: 0 };
}

export function currentModel(state: AgentModelState): string {
  return state.escalated && state.escalation ? state.escalation : state.primary;
}

function noteDivergence(state: AgentModelState, why: string): void {
  state.divergences++;
  if (!state.escalated && state.escalation && state.divergences >= ESCALATE_AFTER) {
    state.escalated = true;
    console.warn(`[Executor] ${why}; escalating ${state.primary} -> ${state.escalation} for this test`);
  }
}

/**
 * Prompt layout for caching: [rules] breakpoint, [test case] breakpoint, then the
 * turn as the user message. A breakpoint is set only once the prefix it closes is
 * long enough for the model to cache it.
 */
export function buildExecutorRequest(context: ExecutorContext, model: string): ChatRequest {
  const prompt = buildExecutorPrompt(context);
  const minimum = getModelSpec(model)?.minCacheableTokens ?? 1024;
  const rulesTokens = estimateTokens(prompt.rules);
  const prefixTokens = rulesTokens + estimateTokens(prompt.testCase);

  return {
    model,
    system: [
      { type: "text", text: prompt.rules, cache: rulesTokens >= minimum },
      { type: "text", text: prompt.testCase, cache: prefixTokens >= minimum },
    ],
    messages: [{ role: "user", content: prompt.turn }],
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    responseSchema: context.mcpToolsPrompt ? undefined : EXECUTOR_ACTION_JSON_SCHEMA,
  };
}

function stripNulls(obj: unknown): unknown {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)])
    );
  }
  return obj;
}

const VALID_VERDICTS = new Set(["pass", "fail", "environment_error"]);

function normalizeAction(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.verdict && !VALID_VERDICTS.has(raw.verdict as string)) {
    const original = raw.verdict;
    raw = { ...raw, verdict: "fail", reason: raw.reason ?? `Non-standard verdict: ${original}` };
  }
  return raw;
}

export function parseAction(content: string): ExecutorAction {
  const cleaned = stripNulls(parseLlmJson(content)) as Record<string, unknown>;
  return ExecutorActionSchema.parse(normalizeAction(cleaned));
}

/** Same action as the last one taken (the step executor's history format). */
function repeatsLastAction(action: ExecutorAction, context: ExecutorContext): boolean {
  if (NO_PROGRESS_EXEMPT.has(action.action)) return false;
  const last = context.previousActions[context.previousActions.length - 1];
  return last?.action === `${action.action}${action.selector ? ` ${action.selector}` : ""}`;
}

export async function getNextAction(
  context: ExecutorContext,
  billing: BillingInfo,
  state?: AgentModelState
): Promise<ExecutorAction> {
  const models = state ?? (await createAgentModelState(billing.workspaceId));

  for (let attempt = 1; ; attempt++) {
    const result = await complete(buildExecutorRequest(context, currentModel(models)), {
      workspaceId: billing.workspaceId,
      projectId: billing.projectId,
      runId: billing.runId,
      agentPhase: "executor",
    });

    let action: ExecutorAction;
    try {
      action = parseAction(result.content);
    } catch (err) {
      noteDivergence(models, "unparseable action");
      if (attempt >= MAX_DECISION_ATTEMPTS) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[Executor] The model returned an invalid action ${attempt} times: ${msg}`);
      }
      continue;
    }

    if (repeatsLastAction(action, context)) {
      const wasEscalated = models.escalated;
      noteDivergence(models, "repeated action without progress");
      // Just escalated: ask the stronger model before acting on the repeat.
      if (!wasEscalated && models.escalated && attempt < MAX_DECISION_ATTEMPTS) continue;
    }
    return action;
  }
}
