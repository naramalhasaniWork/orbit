import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Counts model calls (and their estimated cost) made while executing one
 * test case. The runner opens a scope per case; the AI gateway reports every
 * successful provider call (with its priced cost) into whichever scope is
 * active, so concurrent cases never mix counts.
 * Outside a scope, reporting is a no-op.
 */

export interface ModelUsage {
  calls: number;
  costUsd: number;
}

const storage = new AsyncLocalStorage<ModelUsage>();

export function meterModelCall(costUsd: number): void {
  const usage = storage.getStore();
  if (!usage) return;
  usage.calls++;
  usage.costUsd += costUsd;
}

export async function withModelMeter<T>(fn: () => Promise<T>): Promise<{ result: T; usage: ModelUsage }> {
  const usage: ModelUsage = { calls: 0, costUsd: 0 };
  const result = await storage.run(usage, fn);
  return { result, usage };
}
