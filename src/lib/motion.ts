import type { Transition, Variants } from "framer-motion";

// ============================================================
// Spring Configurations
// ============================================================

export const springs = {
  /** Snappy — buttons, micro-interactions, quick responses */
  snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
  /** Smooth — cards, panels, element transitions */
  smooth: { type: "spring" as const, stiffness: 200, damping: 25 },
  /** Gentle — page transitions, large layout shifts */
  gentle: { type: "spring" as const, stiffness: 150, damping: 20 },
  /** Bounce — playful emphasis, icon entries */
  bounce: { type: "spring" as const, stiffness: 300, damping: 15 },
};

// ============================================================
// Duration Presets (for non-spring animations)
// ============================================================

export const durations = {
  micro: 0.12,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
};

// ============================================================
// Reusable Variants
// ============================================================

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: springs.smooth },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springs.smooth },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  show: { opacity: 1, y: 0, transition: springs.smooth },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: springs.smooth },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  show: { opacity: 1, x: 0, transition: springs.smooth },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: springs.smooth },
};

export const scaleBounce: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  show: { opacity: 1, scale: 1, transition: springs.bounce },
};

// ============================================================
// Stagger Container Variants
// ============================================================

export function staggerContainer(staggerDelay = 0.05): Variants {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.04,
      },
    },
  };
}

export const staggerFast = staggerContainer(0.04);
export const staggerNormal = staggerContainer(0.06);
export const staggerSlow = staggerContainer(0.1);

// ============================================================
// Stagger Item Variants
// ============================================================

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: springs.smooth },
};

export const staggerScaleItem: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: springs.smooth },
};

// ============================================================
// Expand / Collapse (for AnimatePresence)
// ============================================================

export const expandCollapse: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: springs.snappy },
  exit: { height: 0, opacity: 0, transition: { ...springs.snappy, opacity: { duration: 0.12 } } },
};

// ============================================================
// Crossfade (for tab content, view transitions)
// ============================================================

export const crossfade: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: springs.snappy },
  exit: { opacity: 0, y: -4, transition: { duration: durations.fast } },
};

// ============================================================
// Scroll-triggered (whileInView) transitions
// ============================================================

export const scrollReveal: Transition = {
  ...springs.smooth,
};

export const scrollRevealSlow: Transition = {
  ...springs.gentle,
};

// ============================================================
// Hover & Tap Presets
// ============================================================

export const hoverLift = {
  whileHover: { y: -2, transition: { ...springs.snappy, duration: 0.15 } },
  whileTap: { scale: 0.98, transition: { duration: durations.micro } },
};

export const hoverScale = {
  whileHover: { scale: 1.005, transition: { ...springs.snappy, duration: 0.15 } },
  whileTap: { scale: 0.98, transition: { duration: durations.micro } },
};

export const hoverGlow = {
  whileHover: {
    boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.06)",
    transition: { duration: durations.fast },
  },
};

// ============================================================
// Progress Bar Spring
// ============================================================

export const progressSpring: Transition = {
  ...springs.smooth,
  mass: 0.8,
};

// ============================================================
// Reduced Motion — wrap variants to respect prefers-reduced-motion
// ============================================================

export const reducedMotionTransition: Transition = {
  duration: 0,
};
