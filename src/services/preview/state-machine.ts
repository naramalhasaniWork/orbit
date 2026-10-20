import { PREVIEW_STATUS, type PreviewStatus, type ResolveResult } from "./types";

/** How long a PR waits for its preview before Orbit gives up with a neutral check. */
export const PREVIEW_TIMEOUT_MS = 15 * 60 * 1000;

/** Check run name for the preview lifecycle; the test results use "Orbit Test Run". */
export const PREVIEW_CHECK_NAME = "Orbit preview";

export type Transition =
  | { kind: "wait" }
  | { kind: "ready"; url: string; externalId: string }
  | { kind: "fail"; status: PreviewStatus; externalId: string | null; error: string; conclusion: "failure" | "neutral" };

/**
 * Pure: what a pending preview deployment does next, given the provider's answer.
 * Only "pending" rows move; ready/failed/gone are terminal.
 */
export function decideTransition(result: ResolveResult, createdAt: Date, now: Date): Transition {
  switch (result.state) {
    case "ready":
      return { kind: "ready", url: result.url, externalId: result.externalId };
    case "failed":
      return {
        kind: "fail",
        status: PREVIEW_STATUS.failed,
        externalId: result.externalId,
        error: result.reason,
        conclusion: "failure",
      };
    case "gone":
      return {
        kind: "fail",
        status: PREVIEW_STATUS.gone,
        externalId: result.externalId,
        error: "The preview deployment was removed before it could be tested",
        conclusion: "neutral",
      };
    case "pending":
      if (now.getTime() - createdAt.getTime() < PREVIEW_TIMEOUT_MS) return { kind: "wait" };
      return {
        kind: "fail",
        status: PREVIEW_STATUS.failed,
        externalId: null,
        error: `No preview deployment for this commit after ${PREVIEW_TIMEOUT_MS / 60000} minutes`,
        conclusion: "neutral",
      };
  }
}

export function previewCheckText(
  transition: Exclude<Transition, { kind: "wait" }>
): { title: string; summary: string } {
  if (transition.kind === "ready") {
    return { title: "Preview ready, testing it", summary: `Orbit is testing the preview at ${transition.url}` };
  }
  return { title: transition.status === "gone" ? "Preview removed" : "No preview to test", summary: transition.error };
}
