"use client";

import { GroundTrack } from "@/components/telemetry/ground-track";

interface FrameScrubberProps {
  count: number;
  /** Index of the frame on screen; the last frame while following live. */
  index: number;
  live: boolean;
  onSelect: (index: number) => void;
}

/**
 * The ground track as the recording scrubber: one tick per captured frame, a native range
 * input on top for keyboard and pointer, and a 1px playhead.
 */
export function FrameScrubber({ count, index, live, onSelect }: FrameScrubberProps) {
  if (count === 0) return null;
  const ticks = Array.from({ length: count }, (_, i) => ({
    tone: live && i === count - 1 ? ("live" as const) : ("untested" as const),
    major: i === index,
  }));
  const at = count > 1 ? (index / (count - 1)) * 100 : 100;

  return (
    <div className="relative border-t border-border px-3 py-2">
      <GroundTrack ticks={ticks} variant="ruler" noun="frames" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 w-px bg-foreground"
        style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${at / 100})` }}
      />
      <input
        type="range"
        min={0}
        max={count - 1}
        value={index}
        onChange={(e) => onSelect(Number(e.target.value))}
        aria-label="Recording position"
        aria-valuetext={`Frame ${index + 1} of ${count}`}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <div className="tm-label mt-1 flex justify-between text-tm-t3">
        <span>Frame {String(index + 1).padStart(2, "0")}</span>
        <span>{count} captured</span>
      </div>
    </div>
  );
}
