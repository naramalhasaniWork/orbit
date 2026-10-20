import { LiveDot } from "@/components/telemetry/live-dot";
import { STATUS_TONES, type StatusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "pass" | "fail" | "flaky" | "untested" | "running" | "skipped";
  size?: "sm" | "md";
  /** Kept for callers; only a running status ever pulses. */
  pulse?: boolean;
}

const TONE: Record<StatusDotProps["status"], StatusTone> = {
  pass: "pass",
  fail: "fail",
  flaky: "flaky",
  untested: "untested",
  running: "live",
  skipped: "skipped",
};

/**
 * A 6–8px status mark. Decorative: put the status word next to it, or use <Status>.
 * Fail is a square so the shape differs, not just the colour.
 */
export function StatusDot({ status, size = "sm" }: StatusDotProps) {
  const tone = TONE[status];
  if (tone === "live") return <LiveDot size={size === "sm" ? "sm" : "md"} />;
  const spec = STATUS_TONES[tone];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0",
        size === "sm" ? "size-1.5" : "size-2",
        spec.square ? "rounded-[1px]" : "rounded-full",
        tone === "untested" ? "border border-tm-t3" : spec.fill
      )}
    />
  );
}
