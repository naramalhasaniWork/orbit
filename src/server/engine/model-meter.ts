import { AsyncLocalStorage } from "node:async_hooks";
import { calculateTokenCost } from "@/lib/billing/token-tracker";

/**
 * Counts model calls (and their estimated cost) made while executing one
 * test case. The runner opens a scope per case; every provider call reports
 * into whichever scope is active, so concurrent cases never mix counts.
 * Outside a scope, reporting is a no-op.
 */

export interface ModelUsage {
  calls: number;
  costUsd: number;
}

interface ModelCallReport {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

const storage = new AsyncLocalStorage<ModelUsage>();

export function meterModelCall(call: ModelCallReport): void {
  const usage = storage.getStore();
  if (!usage) return;
  usage.calls++;
  usage.costUsd += calculateTokenCost(call.model, call.inputTokens, call.outputTokens, call.cachedTokens ?? 0);
}

export async function withModelMeter<T>(fn: () => Promise<T>): Promise<{ result: T; usage: ModelUsage }> {
  const usage: ModelUsage = { calls: 0, costUsd: 0 };
  const result = await storage.run(usage, fn);
  return { result, usage };
}
