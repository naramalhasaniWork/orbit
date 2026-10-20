import { deriveAssertions, type DeriveBilling, type StepToDerive } from "./assertion-deriver";
import type { RecordedRun, ResolvedAction } from "./types";

/**
 * Compile a passing agent run into replay actions. Every step must end with
 * a deterministic assertion: the agent's own assert, or one derived from the
 * step's `expected` text (one cheap model call for all missing steps). A
 * replay that asserts nothing would pass whatever the app does, so if any
 * step is left without an assertion the case is not compiled and stays
 * agent-only.
 */

export interface CompileInput {
  steps: Array<{ action: string; expected: string }>;
  recorded: RecordedRun;
  billing: DeriveBilling;
}

export type CompileOutcome =
  | { compiled: true; actions: ResolvedAction[] }
  | { compiled: false; reason: string };

type Deriver = typeof deriveAssertions;

export async function compileRecording(
  input: CompileInput, derive: Deriver = deriveAssertions
): Promise<CompileOutcome> {
  const { steps, recorded } = input;
  if (recorded.uncompilable) return { compiled: false, reason: `Run ${recorded.uncompilable}` };

  const actions: ResolvedAction[] = [];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const action = recorded.actions.find((a) => a.stepIndex === stepIndex);
    if (!action) return { compiled: false, reason: `Step ${stepIndex + 1} has no recorded action` };
    actions.push(structuredClone(action));
  }

  const missing = actions.filter((a) => a.action !== "skip_auth" && !a.post.assertion);
  const toDerive: StepToDerive[] = [];
  for (const action of missing) {
    const snapshot = recorded.snapshots.find((s) => s.stepIndex === action.stepIndex);
    if (!snapshot) return { compiled: false, reason: `Step ${action.stepIndex + 1} has no page snapshot` };
    toDerive.push({
      stepIndex: action.stepIndex,
      action: steps[action.stepIndex].action,
      expected: steps[action.stepIndex].expected,
      snapshot,
    });
  }

  if (toDerive.length > 0) {
    let derived: Map<number, NonNullable<ResolvedAction["post"]["assertion"]>>;
    try {
      derived = await derive(toDerive, input.billing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { compiled: false, reason: `Could not derive assertions: ${msg}` };
    }
    for (const action of missing) {
      const assertion = derived.get(action.stepIndex);
      if (!assertion) {
        return { compiled: false, reason: `Step ${action.stepIndex + 1} has no deterministic assertion` };
      }
      action.post.assertion = assertion;
    }
  }

  return { compiled: true, actions };
}
