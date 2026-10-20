import type { ExecutorAction } from "@/agents/schemas/execution-result";

/**
 * A compiled replay script is one ResolvedAction per test-case step: the
 * action the agent took, every way to find its element again, and the
 * deterministic assertion that proves the step worked.
 */

export type ReplayAssertion = NonNullable<ExecutorAction["assertion"]>;

export type ReplayActionKind =
  | "click" | "fill" | "select" | "hover" | "press_key" | "navigate" | "scroll" | "assert"
  /** Login steps the agent skipped because the session was already authenticated */
  | "skip_auth";

/** Ways to find the element again, tried in this order during replay. */
export interface Locators {
  css?: string;
  role?: { role: string; name: string };
  testId?: string;
  text?: string;
}

export interface ResolvedAction {
  stepIndex: number;
  action: ReplayActionKind;
  /** Typed/selected/pressed value; credentials appear only as {{credential:KEY}} placeholders */
  valueRef?: string;
  /** Navigation target: a path for same-origin targets, else an absolute URL */
  url?: string;
  locators?: Locators;
  pre: { urlPattern: string };
  post: { urlPattern: string; assertion?: ReplayAssertion };
}

/** Page state right after a step, kept in memory to derive missing assertions. Never persisted. */
export interface StepSnapshot {
  stepIndex: number;
  url: string;
  title: string;
  visibleText: string;
}

export interface RecordedRun {
  actions: ResolvedAction[];
  snapshots: StepSnapshot[];
  /** Set when the run used something replay can't reproduce (e.g. an MCP tool call) */
  uncompilable?: string;
}

export const REPLAYABLE_ACTIONS = new Set<string>([
  "click", "fill", "select", "hover", "press_key", "navigate", "scroll", "assert",
]);
