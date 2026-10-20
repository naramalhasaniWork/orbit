"use client";

import { motion } from "framer-motion";
import { tween } from "@/lib/motion";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  className?: string;
  /** Trigger on mount instead of scroll */
  onMount?: boolean;
}

const directionOffset = {
  up: { y: 20 },
  down: { y: -20 },
  left: { x: -20 },
  right: { x: 20 },
  none: {},
} as const;

export function FadeIn({
  children,
  delay = 0,
  direction = "up",
  className,
  onMount = false,
}: FadeInProps) {
  const initial = { opacity: 0, ...directionOffset[direction] };
  const target = { opacity: 1, x: 0, y: 0 };
  const transition = { ...tween.open, delay };

  if (onMount) {
    return (
      <motion.div
        initial={initial}
        animate={target}
        transition={transition}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={initial}
      whileInView={target}
      viewport={{ once: true, margin: "-80px" }}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}
