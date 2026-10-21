"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { fadeUp, motionSafe, useReducedMotionSafe } from "@/lib/motion";

const VISIBLE_MS = 4000;

/**
 * "Thanks, report sent." The live region is always mounted so screen readers announce the
 * text when it appears; the visual toast enters from the bottom right.
 */
export function SentToast({ sentAt, onDone }: { sentAt: number | null; onDone: () => void }) {
  const reduced = useReducedMotionSafe();

  useEffect(() => {
    if (sentAt === null) return;
    const timer = window.setTimeout(onDone, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [sentAt, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-toast"
    >
      <AnimatePresence>
        {sentAt !== null && (
          <motion.div
            key={sentAt}
            variants={motionSafe(fadeUp, reduced)}
            initial={reduced ? "initial" : "hidden"}
            animate={reduced ? "animate" : "show"}
            exit={reduced ? "exit" : { opacity: 0, transition: { duration: 0.17 } }}
            className="flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-[13px] text-popover-foreground shadow-elevated"
          >
            <Check aria-hidden="true" className="size-4 text-tm-pass" />
            Thanks, report sent.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
