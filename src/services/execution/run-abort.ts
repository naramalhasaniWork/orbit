import { ShutdownError } from "@/lib/queue/shutdown";
import { RunLockedError } from "@/lib/queue/run-locked";
import { BudgetExceededError } from "@/server/ai/errors";

/**
 * Errors that end the whole run rather than one test case: the worker is shutting down,
 * another worker holds the run, or the AI budget is spent. Per-case catch blocks must
 * rethrow these instead of recording a case verdict.
 */
export function isRunAbort(err: unknown): boolean {
  return err instanceof ShutdownError || err instanceof RunLockedError || err instanceof BudgetExceededError;
}
