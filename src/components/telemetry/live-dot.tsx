"use client";

import { useOffscreen } from "@/hooks/use-offscreen";
import { cn } from "@/lib/utils";

interface LiveDotProps {
  /** Pulse only while a browser is actually running. Off = a static accent dot. */
  live?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const SIZES = { sm: "size-1.5", md: "size-2" };

/**
 * The accent dot. Its 1.6s opacity loop is the only loop in the product; it pauses
 * off-screen and is static under reduced motion (globals.css). Decorative: pair it with a word.
 */
export function LiveDot({ live = true, size = "md", className }: LiveDotProps) {
  const { ref, offscreen } = useOffscreen<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-offscreen={offscreen || undefined}
      className={cn(
        "inline-block shrink-0 rounded-full bg-tm-live motion-safe:animate-[tm-dot-in_180ms_var(--ease-out)_both]",
        live && "tm-live-pulse",
        SIZES[size],
        className
      )}
    />
  );
}
