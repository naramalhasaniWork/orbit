"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { routeDirection, routeVariants, tabStep, useReducedMotionSafe, type RouteDirection } from "@/lib/motion";
import { isSharedNavigationPending, settleSharedNavigation } from "@/lib/view-transition";

interface RouteTransitionProps {
  children: React.ReactNode;
  className?: string;
  /** Ordered tab hrefs: moving between them slides ±12px in the direction of travel. */
  tabs?: readonly string[];
  /** Path prefixes whose inner navigation a nested RouteTransition animates; this one holds still. */
  holdWithin?: readonly string[];
}

export interface RouteState {
  key: string;
  path: string;
  direction: RouteDirection;
  step: 1 | -1 | null;
  animate: boolean;
}

/** The part of the path this transition keys on: a held prefix stays one key for all its sub-pages. */
export function routeKey(pathname: string, project: string, holdWithin: readonly string[] = []): string {
  const held = holdWithin.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return `${held ?? pathname}?${project}`;
}

/** The route after a navigation to `pathname`, derived from the one before it. */
export function nextRoute(prev: RouteState, key: string, pathname: string, tabs: readonly string[] | undefined, sharedPending: boolean): RouteState {
  // Between two tabs it is a sideways move, even when one tab's path nests under another's.
  const step = tabs ? tabStep(prev.path, pathname, tabs) : null;
  return {
    key,
    path: pathname,
    direction: step ? "sibling" : routeDirection(prev.path, pathname),
    step,
    animate: !sharedPending,
  };
}

/** Framer's `initial`: the entrance pose, or false to render the final state straight away. */
export function entranceFor(route: RouteState, reduced: boolean): "initial" | false {
  return route.animate && !reduced ? "initial" : false;
}

/**
 * Route motion: content fades in from 0.15 with an 8px rise into a child, −4px back to a parent,
 * ±12px sideways between tabs. Entrance only; navigation never waits on an exit. First paint, reduced
 * motion and shared-element navigations (the View Transition animates those) swap instantly.
 */
export function RouteTransition({ children, className, tabs, holdWithin }: RouteTransitionProps) {
  const pathname = usePathname() ?? "/";
  const project = useSearchParams().get("project") ?? "";
  const reduced = useReducedMotionSafe();
  const key = routeKey(pathname, project, holdWithin);

  // Direction is derived from the previous route, tracked during render.
  const [route, setRoute] = useState<RouteState>({ key, path: pathname, direction: "none", step: null, animate: false });
  if (route.key !== key) setRoute(nextRoute(route, key, pathname, tabs, isSharedNavigationPending()));

  // The new route is on screen: a pending shared-element transition may now capture it.
  useEffect(() => settleSharedNavigation(), [key]);

  return (
    <motion.div
      key={key}
      variants={routeVariants(route.direction, reduced, route.step)}
      initial={entranceFor(route, reduced)}
      animate="animate"
      className={className}
    >
      {children}
    </motion.div>
  );
}
