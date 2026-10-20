import { ClosingO } from "@/components/telemetry/closing-o";
import type { ClosingOState } from "@/lib/closing-o";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  state?: ClosingOState;
  /** Accent dot when idle. Marketing lockups only; in the app the accent means live. */
  brand?: boolean;
  className?: string;
}

// Lockup: mark = ascender height, gap = 2 strokes, wordmark Instrument Sans 500, −0.035em.
const SIZES = {
  sm: { mark: 20, text: "text-[17px]", gap: "gap-1.5" },
  md: { mark: 24, text: "text-[21px]", gap: "gap-2" },
  lg: { mark: 32, text: "text-[28px]", gap: "gap-2.5" },
};

export function Logo({ size = "md", showText = true, state = "idle", brand = false, className }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center text-tm-t1", s.gap, className)}>
      <ClosingO size={s.mark} state={state} brand={brand} title={showText ? undefined : "Orbit"} />
      {showText && (
        <span className={cn("font-medium leading-none tracking-[-0.035em]", s.text)}>orbit</span>
      )}
    </span>
  );
}
