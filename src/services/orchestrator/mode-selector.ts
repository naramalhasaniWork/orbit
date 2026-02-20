import type { RunMode, RunTrigger } from "@/generated/prisma/client";

interface ModeSelectionInput {
  trigger: RunTrigger;
  changedFiles?: string[];
  targetPaths?: string[];
  prNumber?: number;
  isFirstRun?: boolean;
}

interface ModeSelectionResult {
  mode: RunMode;
  reason: string;
}

export function selectRunMode(input: ModeSelectionInput): ModeSelectionResult {
  const { trigger, changedFiles, targetPaths, isFirstRun } = input;

  if (isFirstRun) {
    return { mode: "full", reason: "First run for this project — executing full test suite" };
  }

  if (targetPaths && targetPaths.length > 0) {
    return { mode: "targeted", reason: `Targeted run for paths: ${targetPaths.join(", ")}` };
  }

  switch (trigger) {
    case "push":
      if (changedFiles && changedFiles.length <= 5) {
        return { mode: "smoke", reason: "Small push — running smoke tests on affected areas" };
      }
      return { mode: "regression", reason: "Push with multiple file changes — regression testing" };

    case "pr":
      return { mode: "regression", reason: "PR trigger — regression testing changed areas" };

    case "scheduled":
      return { mode: "full", reason: "Scheduled run — full test suite" };

    case "manual":
      return { mode: "full", reason: "Manual trigger — full test suite" };

    case "linear":
      return { mode: "targeted", reason: "Linear trigger — targeted testing" };

    case "api":
      return { mode: "full", reason: "API trigger — full test suite" };

    default:
      return { mode: "full", reason: "Default mode" };
  }
}
