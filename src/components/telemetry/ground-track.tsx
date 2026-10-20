import { STATUS_TONES, summarizeTones, type StatusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

export interface GroundTrackTick {
  tone: StatusTone;
  /** Major tick (a page navigation on a run timeline). Ruler variant only. */
  major?: boolean;
}

interface GroundTrackProps {
  ticks: GroundTrackTick[];
  /** Fixed number of slots so strips line up across rows; ticks fill from the left. */
  slots?: number;
  /** "strip": one full-height tick per run (14-run strip). "ruler": minor/major ticks (timelines). */
  variant?: "strip" | "ruler";
  /** RUN STARTS: draw the baseline left to right (280ms). */
  animate?: boolean;
  /** What one tick is, for the accessible summary ("runs", "steps"). */
  noun?: string;
  className?: string;
}

/**
 * The signature motif: a 1px baseline with one tick per event, coloured by result.
 * One device everywhere: run timeline, recording scrubber, the run strip, map edges.
 */
export function GroundTrack({
  ticks,
  slots,
  variant = "strip",
  animate = false,
  noun = "runs",
  className,
}: GroundTrackProps) {
  const count = Math.max(slots ?? 0, ticks.length);
  const cells = Array.from({ length: count }, (_, i) => ticks[i]);
  const isStrip = variant === "strip";

  return (
    <div
      role="img"
      aria-label={summarizeTones(ticks.map((t) => t.tone), noun)}
      className={cn("relative", isStrip ? "h-4" : "h-5", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-1/2 h-px origin-left bg-tm-line-strong",
          animate && "motion-safe:animate-[tm-draw_280ms_var(--ease-out)_both]"
        )}
      />
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-between">
        {cells.map((tick, i) => {
          if (!tick) return <span key={i} className="w-0.5" />;
          const emphasis = tick.tone === "fail" || tick.tone === "live";
          const tall = isStrip || tick.major;
          return (
            <span
              key={i}
              className={cn(
                STATUS_TONES[tick.tone].fill,
                emphasis ? "w-[3px]" : isStrip ? "w-0.5" : "w-px",
                tall ? "h-full" : "h-2"
              )}
            />
          );
        })}
      </span>
    </div>
  );
}
