/**
 * Context Windowing — compresses context for sub-agents so they don't
 * overload their token budget. Priority fields are kept intact, summary
 * fields are truncated, and low-priority fields are dropped.
 */

import { estimateTokens, trimToTokenBudget } from "@/agents/prompts/prompt-builder";

export interface ContextWindowOptions {
  /** Maximum token budget for the windowed context */
  maxTokens: number;
  /** Fields to keep intact (never truncated) */
  priorityFields: string[];
  /** Fields to summarize/truncate if needed */
  summaryFields: string[];
}

interface FieldBudget {
  key: string;
  tokens: number;
  priority: "high" | "medium" | "low";
}

/**
 * Serialize a value to a string for token estimation.
 * Handles objects, arrays, strings, and primitives.
 */
function serializeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

/**
 * Calculate token budgets for each field category.
 * Priority: 60%, Summary: 30%, Low: 10% of remaining budget.
 */
function calculateBudgets(
  context: Record<string, unknown>,
  options: ContextWindowOptions
): FieldBudget[] {
  const { maxTokens, priorityFields, summaryFields } = options;
  const allKeys = Object.keys(context);
  const budgets: FieldBudget[] = [];

  for (const key of allKeys) {
    const value = serializeValue(context[key]);
    const tokens = estimateTokens(value);

    if (priorityFields.includes(key)) {
      budgets.push({ key, tokens, priority: "high" });
    } else if (summaryFields.includes(key)) {
      budgets.push({ key, tokens, priority: "medium" });
    } else {
      budgets.push({ key, tokens, priority: "low" });
    }
  }

  // Sort: high priority first, then medium, then low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  budgets.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Check if priority fields alone exceed budget
  const priorityTotal = budgets
    .filter((b) => b.priority === "high")
    .reduce((sum, b) => sum + b.tokens, 0);

  if (priorityTotal > maxTokens) {
    // Even priority fields exceed budget — mark everything proportionally
    const ratio = maxTokens / priorityTotal;
    for (const budget of budgets) {
      budget.tokens = Math.floor(budget.tokens * ratio * 0.95);
    }
  }

  return budgets;
}

/**
 * Truncate an array field by keeping only the first N items.
 */
function truncateArray(arr: unknown[], maxItems: number): unknown[] {
  if (arr.length <= maxItems) return arr;
  return [
    ...arr.slice(0, maxItems),
    `[...${arr.length - maxItems} more items truncated]`,
  ];
}

/**
 * Summarize a value to fit within a token budget.
 */
function summarizeValue(value: unknown, tokenBudget: number): unknown {
  if (value === null || value === undefined) return value;

  const serialized = serializeValue(value);
  const currentTokens = estimateTokens(serialized);

  if (currentTokens <= tokenBudget) return value;

  // Handle arrays — truncate items
  if (Array.isArray(value)) {
    const ratio = tokenBudget / currentTokens;
    const maxItems = Math.max(1, Math.floor(value.length * ratio));
    return truncateArray(value, maxItems);
  }

  // Handle strings — trim directly
  if (typeof value === "string") {
    return trimToTokenBudget(value, tokenBudget);
  }

  // Handle objects — serialize and trim
  const trimmed = trimToTokenBudget(serialized, tokenBudget);
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

/**
 * Window (compress) a context object to fit within a token budget.
 *
 * Strategy:
 * 1. Keep priority fields intact (up to 60% of budget)
 * 2. Summarize/truncate summary fields (up to 30% of budget)
 * 3. Drop low-priority fields that exceed remaining budget
 */
export function windowContext(
  fullContext: Record<string, unknown>,
  options: ContextWindowOptions
): Record<string, unknown> {
  const { maxTokens, priorityFields, summaryFields } = options;

  // If the entire context fits, return as-is
  const totalTokens = estimateTokens(serializeValue(fullContext));
  if (totalTokens <= maxTokens) return { ...fullContext };

  const budgets = calculateBudgets(fullContext, options);
  const windowed: Record<string, unknown> = {};
  let tokensUsed = 0;

  // Phase 1: Include priority fields (allocate 60% of budget)
  const priorityBudget = Math.floor(maxTokens * 0.6);
  let priorityUsed = 0;

  for (const budget of budgets.filter((b) => b.priority === "high")) {
    const value = fullContext[budget.key];
    const fieldTokens = estimateTokens(serializeValue(value));
    const remainingPriority = priorityBudget - priorityUsed;

    if (fieldTokens <= remainingPriority) {
      windowed[budget.key] = value;
      priorityUsed += fieldTokens;
    } else {
      // Even priority fields might need trimming if budget is very small
      windowed[budget.key] = summarizeValue(value, remainingPriority);
      priorityUsed += Math.min(fieldTokens, remainingPriority);
    }
  }
  tokensUsed = priorityUsed;

  // Phase 2: Include summary fields (allocate 30% of budget)
  const summaryBudget = Math.floor(maxTokens * 0.3);
  let summaryUsed = 0;

  for (const budget of budgets.filter((b) => b.priority === "medium")) {
    const value = fullContext[budget.key];
    const remainingSummary = summaryBudget - summaryUsed;
    if (remainingSummary <= 0) break;

    const summarized = summarizeValue(value, remainingSummary);
    const summarizedTokens = estimateTokens(serializeValue(summarized));

    windowed[budget.key] = summarized;
    summaryUsed += summarizedTokens;
  }
  tokensUsed += summaryUsed;

  // Phase 3: Include low-priority fields if budget remains (10%)
  const remainingBudget = maxTokens - tokensUsed;

  if (remainingBudget > 50) {
    const lowPriorityFields = budgets.filter(
      (b) => b.priority === "low" && summaryFields.indexOf(b.key) === -1
    );
    let lowUsed = 0;

    for (const budget of lowPriorityFields) {
      const value = fullContext[budget.key];
      const fieldTokens = estimateTokens(serializeValue(value));
      const remaining = remainingBudget - lowUsed;

      if (fieldTokens <= remaining) {
        windowed[budget.key] = value;
        lowUsed += fieldTokens;
      } else if (remaining > 100) {
        windowed[budget.key] = summarizeValue(value, remaining);
        break; // Last partial field
      }
      // else: drop this field entirely
    }
  }

  return windowed;
}

/**
 * Estimate the total token count of a context object.
 */
export function estimateContextTokens(
  context: Record<string, unknown>
): number {
  return estimateTokens(serializeValue(context));
}
