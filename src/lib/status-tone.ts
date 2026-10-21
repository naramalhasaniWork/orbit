/**
 * One status vocabulary for the whole product. Status is always glyph + word + colour,
 * never colour alone. `live` is the only tone that uses the accent.
 */
export type StatusTone = "pass" | "fail" | "flaky" | "untested" | "skipped" | "live" | "info";

export interface ToneSpec {
  /** Text glyph; `live` renders a <LiveDot> instead. */
  glyph: string;
  /** Default word shown next to the glyph. */
  label: string;
  /** Text colour class. */
  text: string;
  /** Fill colour class (ticks, dots, bars). */
  fill: string;
  /** Glyph is a filled square (fail) rather than a round dot when drawn as a shape. */
  square: boolean;
}

export const STATUS_TONES: Record<StatusTone, ToneSpec> = {
  pass: { glyph: "✓", label: "Passed", text: "text-tm-pass", fill: "bg-tm-pass", square: false },
  fail: { glyph: "✕", label: "Failed", text: "text-tm-fail", fill: "bg-tm-fail", square: true },
  flaky: { glyph: "◐", label: "Flaky", text: "text-tm-flaky", fill: "bg-tm-flaky", square: false },
  untested: { glyph: "○", label: "Untested", text: "text-tm-t3", fill: "bg-tm-line-strong", square: false },
  skipped: { glyph: "–", label: "Skipped", text: "text-tm-t3", fill: "bg-tm-line-strong", square: false },
  live: { glyph: "●", label: "Live", text: "text-tm-live-text", fill: "bg-tm-live", square: false },
  info: { glyph: "i", label: "Info", text: "text-tm-info", fill: "bg-tm-info", square: false },
};

const LIVE_RUN_STATUSES = new Set(["indexing", "planning", "executing", "reporting"]);

/** A run that ran to an end with results: what home's numbers and sentences are about. Cancelled runs are not. */
export const FINISHED_RUN_STATUSES = ["completed", "failed"] as const;

export function isFinishedRunStatus(status: string): boolean {
  return (FINISHED_RUN_STATUSES as readonly string[]).includes(status);
}

export function isLiveRunStatus(status: string): boolean {
  return LIVE_RUN_STATUSES.has(status);
}

interface RunCounts {
  failed?: number;
  flaky?: number;
}

/** Tone for a TestRun. A completed run with failures is a failure; with only flakes, flaky. */
export function toneForRun(status: string, counts: RunCounts = {}): StatusTone {
  if (isLiveRunStatus(status)) return "live";
  if (status === "failed") return "fail";
  if (status === "cancelled") return "skipped";
  if (status === "queued") return "untested";
  if (status === "completed") {
    if ((counts.failed ?? 0) > 0) return "fail";
    if ((counts.flaky ?? 0) > 0) return "flaky";
    return "pass";
  }
  return "untested";
}

/** The word for a run that agrees with its glyph: a completed run with failures says Failed. */
export function runWord(status: string, counts: RunCounts = {}): string {
  const tone = toneForRun(status, counts);
  if (status === "completed") return tone === "fail" ? "Failed" : tone === "flaky" ? "Flaky" : "Passed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Tone for a TestResult verdict. A healed selector still passed. */
export function toneForVerdict(verdict: string): StatusTone {
  switch (verdict) {
    case "pass":
    case "healed":
      return "pass";
    case "fail":
    case "environment_error":
      return "fail";
    case "flaky":
      return "flaky";
    case "skipped":
      return "skipped";
    default:
      return "untested";
  }
}

/** Tone for a project's health. */
export function toneForHealth(health: string): StatusTone {
  if (health === "healthy") return "pass";
  if (health === "failing") return "fail";
  if (health === "degraded") return "flaky";
  return "untested";
}

/** Accessible summary of a sequence of tones, e.g. "14 runs: 12 passed, 2 failed". */
export function summarizeTones(tones: StatusTone[], noun: string): string {
  if (tones.length === 0) return `No ${noun} yet`;
  const counts = new Map<StatusTone, number>();
  for (const t of tones) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = Array.from(counts, ([tone, n]) => `${n} ${STATUS_TONES[tone].label.toLowerCase()}`);
  return `${tones.length} ${noun}: ${parts.join(", ")}`;
}
