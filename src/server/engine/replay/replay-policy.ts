import type { StoredScript } from "./script-store";

/**
 * Decides, per case execution, whether to replay the compiled script or run
 * the agent. Pure, so every invalidation rule is unit-testable:
 *   - no script, or the case's steps changed since compiling → agent (and compile)
 *   - more than 30% of the last 10 replays diverged → agent (replay benched)
 *   - not verified by the agent for 14 days, or a 1-in-20 sample → agent re-verify
 *   - otherwise replay; a `suspect` script (its code changed) gets 2s locator timeouts
 */

export const FLAKE_WINDOW = 10;
export const FLAKE_THRESHOLD = 0.3;
export const REVERIFY_SAMPLE_RATE = 1 / 20;
export const REVERIFY_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
export const LOCATOR_TIMEOUT_MS = 10_000;
export const SUSPECT_LOCATOR_TIMEOUT_MS = 2_000;

export type AgentReason = "no_script" | "steps_changed" | "flaky" | "reverify" | "store_unavailable";

export type ExecutionDecision =
  | { use: "replay"; script: StoredScript; locatorTimeoutMs: number }
  | { use: "agent"; reason: AgentReason; script?: StoredScript };

interface DecisionInput {
  script: StoredScript | null;
  stepsHash: string;
  /** Newest first: whether each recent replay diverged */
  recentDivergences: boolean[];
  now: Date;
  random: () => number;
}

export function isReplayBenched(recentDivergences: boolean[]): boolean {
  const window = recentDivergences.slice(0, FLAKE_WINDOW);
  const diverged = window.filter(Boolean).length;
  return diverged / FLAKE_WINDOW > FLAKE_THRESHOLD;
}

export function decideExecution(input: DecisionInput): ExecutionDecision {
  const { script } = input;
  if (!script) return { use: "agent", reason: "no_script" };
  if (script.stepsHash !== input.stepsHash) return { use: "agent", reason: "steps_changed" };
  if (isReplayBenched(input.recentDivergences)) return { use: "agent", reason: "flaky", script };

  const sinceVerified = input.now.getTime() - script.lastVerifiedByAgentAt.getTime();
  if (sinceVerified > REVERIFY_AFTER_MS || input.random() < REVERIFY_SAMPLE_RATE) {
    return { use: "agent", reason: "reverify", script };
  }

  return {
    use: "replay",
    script,
    locatorTimeoutMs: script.status === "suspect" ? SUSPECT_LOCATOR_TIMEOUT_MS : LOCATOR_TIMEOUT_MS,
  };
}

/** Only a fresh compile needs the agent run's recording; re-verify and benched runs keep the script. */
export function shouldCompile(decision: ExecutionDecision): boolean {
  return decision.use === "agent" && (decision.reason === "no_script" || decision.reason === "steps_changed");
}
