import { useReducedMotion, type Transition, type Variants } from "framer-motion";

// ============================================================
// Telemetry motion — the single source.
// Motion reports a state change; it never decorates. CSS mirrors these
// values as --ease-* / --dur-* in globals.css for CSS-only components.
// ============================================================

/** Cubic-bezier control points (Framer accepts the array form). */
export const ease = {
  /** Enter and settle. */
  out: [0.2, 0.7, 0, 1] as const,
  /** Exit. Never for an entrance. */
  in: [0.4, 0, 1, 1] as const,
  /** Moving something that stays on screen. */
  inOut: [0.6, 0, 0.2, 1] as const,
};

/** Seconds. Duration scales with distance and size; nothing exceeds 0.4s. */
export const durations = {
  /** Press, hover, toggle. */
  feedback: 0.12,
  /** Tab, chip, tooltip, number roll. */
  change: 0.18,
  /** Popover, dialog, drawer, route child. */
  open: 0.24,
  /** List reorder, panel resize, the O closing. */
  layout: 0.28,
};

/** Exits run at 70% of the entry duration. */
export function exitDuration(entry: number): number {
  return Math.round(entry * 0.7 * 1000) / 1000;
}

/** Ready-made tween transitions, one per duration. */
export const tween: Record<keyof typeof durations, Transition> = {
  feedback: { duration: durations.feedback, ease: ease.out },
  change: { duration: durations.change, ease: ease.out },
  open: { duration: durations.open, ease: ease.out },
  layout: { duration: durations.layout, ease: ease.out },
};

/** Gestures and drags only: no visible overshoot, reversible mid-flight. */
export const gestureSpring: Transition = { type: "spring", stiffness: 500, damping: 40 };

/** The live dot's loop. CSS class `.tm-live-pulse` is the same animation. */
export const LIVE_PULSE_SECONDS = 1.6;

// ============================================================
// Variants
// ============================================================

const exit = (d: number): Transition => ({ duration: exitDuration(d), ease: ease.in });

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween.change },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: tween.open },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: tween.open },
};

/** Route motion is directional and starts at 0.15 opacity, never 0. */
export const routeChild: Variants = {
  initial: { opacity: 0.15, y: 8 },
  animate: { opacity: 1, y: 0, transition: tween.open },
  exit: { opacity: 0, transition: exit(durations.open) },
};

export const routeBack: Variants = {
  initial: { opacity: 0.15, y: -4 },
  animate: { opacity: 1, y: 0, transition: tween.open },
  exit: { opacity: 0, transition: exit(durations.open) },
};

export const routeSibling = (direction: 1 | -1): Variants => ({
  initial: { opacity: 0.15, x: 12 * direction },
  animate: { opacity: 1, x: 0, transition: tween.change },
  exit: { opacity: 0, transition: exit(durations.change) },
});

/** Popovers grow from their trigger origin, from 0.96, never 0. */
export const popover: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: tween.change },
  exit: { opacity: 0, scale: 0.96, transition: exit(durations.change) },
};

export const drawer = (edge: "left" | "right"): Variants => ({
  initial: { x: edge === "left" ? "-100%" : "100%" },
  animate: { x: 0, transition: tween.open },
  exit: { x: edge === "left" ? "-100%" : "100%", transition: exit(durations.open) },
});

/** Reduced motion: every movement becomes a 120ms cross-fade. */
export const crossfade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: tween.feedback },
  exit: { opacity: 0, transition: exit(durations.feedback) },
};

/** Pick the reduced-motion fallback when the user asked for it. */
export function motionSafe(variants: Variants, reduced: boolean): Variants {
  return reduced ? crossfade : variants;
}

/** Framer's hook, normalised: null (unknown, e.g. on the server) counts as "motion allowed". */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}

// ============================================================
// Stagger: 24ms per item, at most 6 items, only for a list the user just asked for.
// ============================================================

export const STAGGER_SECONDS = 0.024;
export const STAGGER_MAX_ITEMS = 6;

/** Delay for item i; items past the sixth appear with the sixth. */
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX_ITEMS - 1) * STAGGER_SECONDS;
}

export function staggerContainer(stagger = STAGGER_SECONDS): Variants {
  return {
    hidden: { opacity: 1 },
    show: { opacity: 1, transition: { staggerChildren: stagger } },
  };
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: tween.open },
};

export const staggerScaleItem = staggerItem;

/** Height is the one layout property allowed here: it is a disclosure, not a list. */
export const expandCollapse: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: tween.open },
  exit: { height: 0, opacity: 0, transition: exit(durations.open) },
};
