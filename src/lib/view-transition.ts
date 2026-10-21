/**
 * Shared-element route transitions on the View Transitions API.
 *
 * A link that carries a shared name (a run's title, the map preview) hands that element to the
 * destination's header: the browser morphs one into the other while the rest of the workspace
 * fades and rises (CSS in globals.css). Browsers without the API, and reduced motion, get the
 * plain RouteTransition entrance instead. Nothing here waits longer than NAVIGATION_TIMEOUT_MS:
 * while the update callback is pending the page is frozen on its old frame.
 */

/** The longest a click may hold the old frame before the transition runs regardless. */
export const NAVIGATION_TIMEOUT_MS = 400;
/** After the route commits, how long to wait for the destination's shared element to mount. */
export const TARGET_WAIT_MS = 250;

/** A valid `view-transition-name` for one entity: `run-<id>`, `system-map`. */
export function sharedName(kind: string, id?: string): string {
  const raw = id ? `${kind}-${id}` : kind;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** Props for the element that receives (or hands over) a shared name. */
export function sharedProps(name: string): { "data-vt": string; style: { viewTransitionName: string } } {
  return { "data-vt": name, style: { viewTransitionName: name } };
}

// ------------------------------------------------------------------
// The pending navigation: begun by a TransitionLink, settled when RouteTransition commits the new route.
// ------------------------------------------------------------------

let pending: { resolve: () => void } | null = null;

/** True while a shared-element navigation is in flight; RouteTransition then skips its own entrance. */
export function isSharedNavigationPending(): boolean {
  return pending !== null;
}

/** Resolves when the next route commits, or after `timeoutMs`, whichever is first. */
export function beginSharedNavigation(timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<void> {
  pending?.resolve();
  return new Promise<void>((resolve) => {
    const entry = {
      resolve: () => {
        clearTimeout(timer);
        if (pending === entry) pending = null;
        resolve();
      },
    };
    const timer = setTimeout(entry.resolve, timeoutMs);
    pending = entry;
  });
}

/** Called once the new route has rendered. */
export function settleSharedNavigation(): void {
  pending?.resolve();
}

/** Resolves when `find()` returns something, polling each frame, or after `timeoutMs`. */
export function waitFor(find: () => unknown, timeoutMs = TARGET_WAIT_MS): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (find() || performance.now() - start >= timeoutMs) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

interface ViewTransitionDocument {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
}

/** The API, when this browser has it and the user has not asked for less motion. */
export function viewTransitionStarter(doc: unknown, reducedMotion: boolean): ViewTransitionDocument["startViewTransition"] | null {
  if (reducedMotion || !doc) return null;
  const start = (doc as ViewTransitionDocument).startViewTransition;
  return typeof start === "function" ? start.bind(doc) : null;
}
