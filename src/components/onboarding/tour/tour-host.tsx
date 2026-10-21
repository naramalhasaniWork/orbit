"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isEditableTarget } from "@/lib/shortcuts/matcher";
import {
  TOUR_IDLE,
  buildTourStops,
  currentStop,
  shouldStartTour,
  tourReducer,
  type TourContext,
  type TourStop,
} from "@/lib/onboarding/tour";
import { Coachmark } from "./coachmark";

/** How long a stop's element may take to appear (route change plus server render) before it is skipped. */
const TARGET_TIMEOUT_MS = 8000;
const OTHER_DIALOG = '[role="dialog"][data-state="open"]:not([data-tour-card]), [role="alertdialog"][data-state="open"]';

/** Resolves with the element, or null when it never shows up. */
function waitForTarget(target: string, signal: AbortSignal): Promise<HTMLElement | null> {
  const selector = `[data-tour="${target}"]`;
  return new Promise((resolve) => {
    const found = () => document.querySelector<HTMLElement>(selector);
    const now = found();
    if (now) return resolve(now);
    const observer = new MutationObserver(() => {
      const el = found();
      if (el) finish(el);
    });
    const timer = window.setTimeout(() => finish(null), TARGET_TIMEOUT_MS);
    const finish = (el: HTMLElement | null) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(el);
    };
    signal.addEventListener("abort", () => finish(null));
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/** Is the browser already on the stop's page (path and every query param it names)? */
function onStopPage(stop: TourStop, pathname: string, params: URLSearchParams): boolean {
  if (!stop.href) return true;
  const want = new URL(stop.href, window.location.origin);
  return want.pathname === pathname && Array.from(want.searchParams).every(([k, v]) => params.get(k) === v);
}

/**
 * Runs the dashboard tour when the URL asks for it (`?tour=start`, after the first run or from
 * "Replay tour"). Each stop navigates to its page, waits for its `data-tour` element and spotlights it;
 * a stop whose element never appears is skipped. Finishing or skipping is saved per user.
 */
export function TourHost() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, dispatch] = useReducer(tourReducer, TOUR_IDLE);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const stop = currentStop(state);
  const tourParam = params.get("tour");
  const project = params.get("project");
  const saved = useRef(false);

  // Start: read the user's completion and the workspace facts, then drop ?tour= so a reload doesn't restart it.
  useEffect(() => {
    if (tourParam !== "start") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    router.replace(url.pathname + url.search);
    const query = project ? `?project=${encodeURIComponent(project)}` : "";
    fetch(`/api/user/onboarding-tour${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { completedAt: string | null; context: TourContext | null } } | null) => {
        const data = json?.data;
        if (!data?.context || !shouldStartTour(tourParam, data.completedAt)) return;
        saved.current = false;
        dispatch({ type: "start", stops: buildTourStops(data.context) });
      })
      .catch(() => undefined);
  }, [tourParam, project, router]);

  // Each stop: go to its page, then wait for its element.
  const stopId = stop?.id ?? null;
  useEffect(() => {
    setTarget(null);
    if (!stop) return;
    if (!onStopPage(stop, pathname, new URLSearchParams(window.location.search)) && stop.href) router.push(stop.href);
    const abort = new AbortController();
    waitForTarget(stop.target, abort.signal).then((el) => {
      if (abort.signal.aborted) return;
      if (!el) return dispatch({ type: "missing", id: stop.id });
      el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      setTarget(el);
    });
    return () => abort.abort();
    // Re-run per stop only; navigation inside a stop must not restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId]);

  // Save once when the tour ends, however it ended.
  useEffect(() => {
    if (state.status !== "done" || saved.current) return;
    saved.current = true;
    fetch("/api/user/onboarding-tour", { method: "POST" }).catch(() => undefined);
  }, [state.status]);

  // → for next and Esc to skip, from anywhere on the page (Esc inside the card is handled there).
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const skip = useCallback(() => dispatch({ type: "skip" }), []);
  useEffect(() => {
    if (!stop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Escape" && !document.querySelector(OTHER_DIALOG)) {
        dispatch({ type: "escape" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop, next]);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {stop && target ? `Tour, step ${state.index + 1} of ${state.stops.length}: ${stop.title}. ${stop.body}` : ""}
      </div>
      {stop && target && (
        <Coachmark key={stop.id} stop={stop} target={target} index={state.index} total={state.stops.length} onNext={next} onSkip={skip} />
      )}
    </>
  );
}
