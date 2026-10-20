"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { routeDirection, routeVariants, useReducedMotionSafe, type RouteDirection } from "@/lib/motion";

interface RouteTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Directional route motion: into a child +8px y, back −4px y, siblings ±12px x, from 0.15 opacity.
 * Entrance only — navigation never waits on an exit. Switching project cross-fades.
 */
export function RouteTransition({ children, className }: RouteTransitionProps) {
  const pathname = usePathname() ?? "/";
  const project = useSearchParams().get("project") ?? "";
  const reduced = useReducedMotionSafe();
  const key = `${pathname}?${project}`;

  // Direction is derived from the previous route, tracked during render.
  // First paint does not animate.
  const [route, setRoute] = useState<{ key: string; path: string; direction: RouteDirection; changed: boolean }>({
    key,
    path: pathname,
    direction: "none",
    changed: false,
  });
  if (route.key !== key) {
    setRoute({ key, path: pathname, direction: routeDirection(route.path, pathname), changed: true });
  }

  return (
    <motion.div
      key={key}
      variants={routeVariants(route.direction, reduced)}
      initial={route.changed ? "initial" : false}
      animate="animate"
      className={className}
    >
      {children}
    </motion.div>
  );
}
