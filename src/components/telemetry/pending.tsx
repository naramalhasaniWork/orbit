"use client";

import { useOffscreen } from "@/hooks/use-offscreen";
import { cn } from "@/lib/utils";

interface PendingProps {
  /** Spoken to screen readers; also shown when `showLabel`. */
  label?: string;
  showLabel?: boolean;
  className?: string;
}

/**
 * Waiting on the server: a 1px indeterminate rule, never a spinner. It runs only while
 * mounted and visible, and is a still rule under reduced motion.
 */
export function Pending({ label = "Loading", showLabel = false, className }: PendingProps) {
  const { ref, offscreen } = useOffscreen<HTMLSpanElement>();
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <span ref={ref} aria-hidden="true" className="relative block h-px w-8 overflow-hidden bg-tm-line">
        <span
          data-offscreen={offscreen || undefined}
          className="absolute inset-y-0 left-0 w-1/3 bg-tm-t2 motion-safe:animate-[tm-indeterminate_1.2s_linear_infinite] data-[offscreen]:[animation-play-state:paused]"
        />
      </span>
      <span className={cn("tm-label text-tm-t3", !showLabel && "sr-only")}>{label}</span>
    </span>
  );
}
