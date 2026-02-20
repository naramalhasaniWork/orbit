"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ScreenshotFrame } from "@/hooks/use-screenshot-stream";

// ============================================================
// Types
// ============================================================

interface ScreenshotThumbnailStripProps {
  frames: ScreenshotFrame[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function ScreenshotThumbnailStrip({
  frames,
  activeIndex,
  onSelect,
  className,
}: ScreenshotThumbnailStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to the latest frame
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  if (frames.length === 0) return null;

  return (
    <div
      className={cn(
        "border-t border-white/[0.06] bg-black/20 px-2 py-1.5",
        className
      )}
    >
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        {frames.map((frame, index) => (
          <button
            key={`${frame.testCaseId}-${frame.stepIndex}-${frame.timestamp}`}
            ref={index === activeIndex ? activeThumbRef : undefined}
            onClick={() => onSelect(index)}
            className={cn(
              "shrink-0 rounded-sm overflow-hidden border transition-all",
              "focus:outline-none focus:ring-1 focus:ring-orbit-accent",
              "h-12 w-20 relative",
              index === activeIndex
                ? "border-orbit-accent ring-1 ring-orbit-accent/30"
                : "border-white/[0.08] hover:border-white/[0.15]"
            )}
          >
            <img
              src={`data:image/jpeg;base64,${frame.imageBase64}`}
              alt={`Step ${frame.stepIndex + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white/70 text-center py-px">
              {frame.stepIndex === -1 ? "Init" : `#${frame.stepIndex + 1}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
