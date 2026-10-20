import { toneForRun, type StatusTone } from "@/lib/status-tone";

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
  failed: number;
  flaky: number;
}

/** The home page's one-line state of the project, from its runs (newest first). Never invented. */
export function homeHeadline(runs: HeadlineRun[]): string {
  if (runs.length === 0) return "No runs yet.";
  const latestTone: StatusTone = toneForRun(runs[0].status, runs[0]);
  if (latestTone === "live") return "A run is live now.";
  const finished = runs.find((r) => toneForRun(r.status, r) !== "live" && r.status !== "queued");
  if (!finished) return "Waiting for the first run to finish.";
  const tone = toneForRun(finished.status, finished);
  if (tone === "fail") {
    if (finished.failed === 0) return "The latest run failed before its tests finished.";
    return finished.failed === 1 ? "One test failed in the latest run." : `${finished.failed} tests failed in the latest run.`;
  }
  if (tone === "flaky") return finished.flaky === 1 ? "The latest run passed, with one flaky test." : `The latest run passed, with ${finished.flaky} flaky tests.`;
  if (tone === "skipped") return "The latest run was stopped.";
  return "Everything passed on the latest run.";
}
