import type { RunMode, RunTrigger } from "@/generated/prisma/client";

interface ModeSelectionInput {
  trigger: RunTrigger;
  changedFiles?: string[];
  targetPaths?: string[];
  prNumber?: number;
  isFirstRun?: boolean;
  requestedMode?: RunMode;
}

interface ModeSelectionResult {
  mode: RunMode;
  reason: string;
  skipIndexing: boolean;
  skipPlanning: boolean;
}

/**
 * Determines which test cases to run, and whether to skip indexing/planning.
 * Run modes per spec:
 *  - full: all test cases (nightly, first run, manual)
 *  - smoke: critical path only, priorityScore >= 80 (small pushes)
 *  - regression: tests covering changed code (PR, large push)
 *  - targeted: user-specified paths only (Linear, explicit scope)
 */
export function selectRunMode(input: ModeSelectionInput): ModeSelectionResult {
  const { trigger, changedFiles, targetPaths, isFirstRun, requestedMode } = input;

  // Explicit override from the caller always wins
  if (requestedMode) {
    return {
      mode: requestedMode,
      reason: `Explicitly requested ${requestedMode} mode`,
      skipIndexing: requestedMode === "smoke",
      skipPlanning: requestedMode === "smoke" || requestedMode === "targeted",
    };
  }

  if (isFirstRun) {
    return {
      mode: "full",
      reason: "First run for this project — executing full test suite",
      skipIndexing: false,
      skipPlanning: false,
    };
  }

  if (targetPaths && targetPaths.length > 0) {
    return {
      mode: "targeted",
      reason: `Targeted run for paths: ${targetPaths.join(", ")}`,
      skipIndexing: true,
      skipPlanning: true,
    };
  }

  switch (trigger) {
    case "push":
      if (changedFiles && changedFiles.length <= 5) {
        return {
          mode: "smoke",
          reason: "Small push — running smoke tests on affected areas",
          skipIndexing: false,
          skipPlanning: true,
        };
      }
      return {
        mode: "regression",
        reason: "Push with multiple file changes — regression testing",
        skipIndexing: false,
        skipPlanning: true,
      };

    case "pr":
      return {
        mode: "regression",
        reason: "PR trigger — regression testing changed areas",
        skipIndexing: false,
        skipPlanning: true,
      };

    case "scheduled":
      return {
        mode: "full",
        reason: "Scheduled run — full test suite",
        skipIndexing: false,
        skipPlanning: false,
      };

    case "manual":
      return {
        mode: "full",
        reason: "Manual trigger — full test suite",
        skipIndexing: false,
        skipPlanning: false,
      };

    case "linear":
      return {
        mode: "targeted",
        reason: "Linear trigger — targeted testing for linked issue",
        skipIndexing: true,
        skipPlanning: true,
      };

    case "api":
      return {
        mode: "full",
        reason: "API trigger — full test suite",
        skipIndexing: false,
        skipPlanning: false,
      };

    default:
      return {
        mode: "full",
        reason: "Default mode",
        skipIndexing: false,
        skipPlanning: false,
      };
  }
}

export type { ModeSelectionInput, ModeSelectionResult };
