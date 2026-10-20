"use client";

import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { durations } from "@/lib/motion";

interface ContentTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps page content with a fade transition keyed on the active project.
 * When the project query param changes, content crossfades smoothly.
 */
export function ContentTransition({ children, className }: ContentTransitionProps) {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? "default";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={projectId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: durations.change }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
