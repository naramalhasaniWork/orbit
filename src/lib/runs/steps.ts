/** A test result's step log, normalised from the loose JSON the executors write. */
export interface ParsedStep {
  /** Index used by screenshots (the step's own stepIndex when present, else its position). */
  index: number;
  action: string;
  status: "pass" | "fail" | "pending";
  durationMs?: number;
  detail?: string;
  screenshot?: string;
}

function parseStepStatus(raw: unknown): ParsedStep["status"] {
  if (typeof raw !== "string") return "pass";
  if (raw === "fail" || raw === "failed" || raw === "error") return "fail";
  if (raw === "pending" || raw === "running" || raw === "skipped") return "pending";
  return "pass";
}

export function parseSteps(steps: unknown): ParsedStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step, i) => {
    if (typeof step === "string") return { index: i, action: step, status: "pass" as const };
    if (typeof step === "object" && step !== null) {
      const s = step as Record<string, unknown>;
      const action = s.action ?? s.description ?? s.name;
      return {
        index: typeof s.stepIndex === "number" ? s.stepIndex : i,
        action: typeof action === "string" ? action : JSON.stringify(step),
        status: parseStepStatus(s.status),
        durationMs: typeof s.durationMs === "number" ? s.durationMs : undefined,
        detail: typeof s.detail === "string" ? s.detail : undefined,
        screenshot: typeof s.screenshot === "string" ? s.screenshot : undefined,
      };
    }
    return { index: i, action: JSON.stringify(step), status: "pass" as const };
  });
}

export function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export interface EvidenceShot {
  url: string;
  stepIndex: number | null;
  testResultId?: string | null;
}

/**
 * Before / After screenshots around the failing step of one test result:
 * the last shot before the step, and the first shot at or after it.
 */
export function pickEvidence(
  shots: EvidenceShot[],
  resultId: string,
  failedIndex: number
): { before?: EvidenceShot; after?: EvidenceShot } {
  const own = shots
    .filter((s) => s.testResultId === resultId && s.stepIndex !== null)
    .sort((a, b) => (a.stepIndex as number) - (b.stepIndex as number));
  const before = [...own].reverse().find((s) => (s.stepIndex as number) < failedIndex);
  const after = own.find((s) => (s.stepIndex as number) >= failedIndex);
  return { before, after };
}
