import { isFinishedRunStatus, toneForRun, type StatusTone } from "@/lib/status-tone";

/** First sentence of a failure write-up, for one-line previews. */
export function firstSentence(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end >= 0 ? flat.slice(0, end + 1) : flat;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

interface HeadlineRun {
  status: string;
  passed?: number;
  failed: number;
  flaky: number;
}

/**
 * The run every home number and sentence is about: the newest run that finished (completed or failed).
 * Runs are newest first, ordered by when they started.
 */
export function latestFinished<R extends { status: string }>(runs: R[]): R | undefined {
  return runs.find((r) => isFinishedRunStatus(r.status));
}

/** Pass rate of one run, or null when it executed nothing (never shown as 0% or 100%). */
export function passRateOf(run: { passed?: number; failed: number; flaky: number } | undefined): number | null {
  if (!run) return null;
  const executed = (run.passed ?? 0) + run.failed + run.flaky;
  return executed > 0 ? Math.round(((run.passed ?? 0) / executed) * 100) : null;
}

/** The home page's one-line state of the project, from its runs (newest first). Never invented. */
export function homeHeadline(runs: HeadlineRun[]): string {
  if (runs.length === 0) return "No runs yet.";
  if (toneForRun(runs[0].status, runs[0]) === "live") return "A run is live now.";
  const finished = latestFinished(runs);
  if (!finished) return "Waiting for the first run to finish.";
  const tone: StatusTone = toneForRun(finished.status, finished);
  if (tone === "fail") {
    if (finished.failed === 0) return "The latest run failed before its tests finished.";
    return finished.failed === 1 ? "One test failed in the latest run." : `${finished.failed} tests failed in the latest run.`;
  }
  if (tone === "flaky") return finished.flaky === 1 ? "The latest run passed, with one flaky test." : `The latest run passed, with ${finished.flaky} flaky tests.`;
  if (passRateOf(finished) === null) return "The latest run finished without running any tests.";
  return "Everything passed on the latest run.";
}
