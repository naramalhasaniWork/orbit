/**
 * The dashboard tour: a few stops over the user's real workspace, each pointing at an element
 * marked `data-tour="<target>"`. The copy is built from the workspace's own rows; a stop whose
 * subject does not exist yet (no run) is left out, and a stop whose element is missing on the
 * page is skipped at runtime.
 */

export interface TourContext {
  projectId: string;
  projectName: string;
  /** The project's latest finished run, or null before the first one. */
  run: { id: string; number: number; total: number; passed: number; failed: number } | null;
  nodeCount: number;
  githubConnected: boolean;
}

export interface TourStop {
  id: string;
  /** Value of the element's data-tour attribute. */
  target: string;
  /** Where the element lives; null: wherever the user is (it is in the header). */
  href: string | null;
  title: string;
  body: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildTourStops(ctx: TourContext): TourStop[] {
  const stops: TourStop[] = [];
  const { run, projectId } = ctx;

  if (run) {
    const runHref = `/dashboard/runs/${run.id}?project=${projectId}`;
    stops.push({
      id: "run",
      target: "run",
      href: runHref,
      title: `Run #${run.number}`,
      body: `Your latest run: Orbit walked ${plural(run.total, "test")} of ${ctx.projectName} in a real browser.`,
    });
    stops.push(
      run.failed > 0
        ? {
            id: "result",
            target: "what-broke",
            href: runHref,
            title: "What broke",
            body: `Orbit explains ${run.failed === 1 ? "the failure" : `all ${run.failed} failures`} in plain English, with screenshots from before and after the step that broke.`,
          }
        : {
            id: "result",
            target: "run-stats",
            href: runHref,
            title: "All passed",
            body: `${plural(run.passed, "test")} passed, and next time Orbit replays those passing steps without calling a model.`,
          }
    );
  }

  stops.push({
    id: "map",
    target: "system-map",
    href: `/dashboard/map?project=${projectId}`,
    title: "System Map",
    body: `Orbit mapped ${plural(ctx.nodeCount, "node")} of your repo, from routes to data models; pick one to trace the journeys through it.`,
  });
  stops.push({
    id: "pr",
    target: "github",
    href: "/dashboard/settings?tab=integrations",
    title: "Every pull request",
    body: ctx.githubConnected
      ? "GitHub is connected, so Orbit tests the journeys each pull request touches and posts the result as a check."
      : "Connect GitHub and Orbit tests the journeys each pull request touches, then posts the result as a check.",
  });
  stops.push({
    id: "integrations",
    target: "integrations",
    href: "/dashboard/settings?tab=integrations",
    title: "Integrations",
    body: "Send failures to Linear and Slack, and test Railway or Cloudflare previews as soon as they deploy.",
  });
  stops.push({
    id: "palette",
    target: "command-palette",
    href: null,
    title: "Command palette",
    body: "Press ⌘K or Ctrl K to jump anywhere or start a run from the keyboard.",
  });
  return stops;
}

export interface TourState {
  status: "idle" | "active" | "done";
  stops: TourStop[];
  index: number;
  /** How it ended: every stop seen, or skipped part-way (Skip or Esc). */
  outcome: "finished" | "skipped" | null;
}

export type TourAction =
  | { type: "start"; stops: TourStop[] }
  | { type: "next" }
  | { type: "skip" }
  | { type: "escape" }
  /** The stop's element never appeared; `id` guards against a late report for an earlier stop. */
  | { type: "missing"; id: string };

export const TOUR_IDLE: TourState = { status: "idle", stops: [], index: 0, outcome: null };

function advance(state: TourState): TourState {
  const index = state.index + 1;
  return index < state.stops.length
    ? { ...state, index }
    : { ...state, status: "done", outcome: "finished" };
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  if (action.type === "start") {
    return action.stops.length
      ? { status: "active", stops: action.stops, index: 0, outcome: null }
      : { ...TOUR_IDLE, status: "done", outcome: "finished" };
  }
  if (state.status !== "active") return state;
  switch (action.type) {
    case "next":
      return advance(state);
    case "missing":
      return state.stops[state.index]?.id === action.id ? advance(state) : state;
    case "skip":
    case "escape":
      return { ...state, status: "done", outcome: "skipped" };
  }
}

export function currentStop(state: TourState): TourStop | null {
  return state.status === "active" ? state.stops[state.index] ?? null : null;
}

/** `?tour=start` shows the tour once: after the first run, or after "Replay tour" marked it due again. */
export function shouldStartTour(param: string | null, completedAt: string | null): boolean {
  return param === "start" && completedAt === null;
}
