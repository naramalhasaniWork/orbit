import type { StorageState } from "@/services/execution/browser-manager";
import type { TestCaseForExecution, TestCaseResult } from "@/services/execution/test-case-executor";

/**
 * One way of executing a test case. The dispatcher (case-dispatcher.ts)
 * holds the registry and tries executors in order: the first whose canRun
 * accepts the case runs it, and a null result passes the case on to the
 * next executor (e.g. an API case with no parseable request falls back to
 * the browser).
 */
export type CaseExecutorKind = "browser" | "api" | "visual" | "tool";

export interface CaseRunContext {
  runId: string;
  environmentUrl: string;
  credentials: Record<string, string>;
  /** Logged-in session for the case's role, when the run has one */
  storageState?: StorageState;
  /** Set for real runs; enables compile-and-replay (scripts are keyed per environment) */
  environmentId?: string;
}

export interface CaseExecutor {
  kind: CaseExecutorKind;
  canRun(testCase: TestCaseForExecution): boolean;
  run(testCase: TestCaseForExecution, ctx: CaseRunContext): Promise<TestCaseResult | null>;
}
