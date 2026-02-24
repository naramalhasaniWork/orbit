import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "pass" | "fail" | "flaky" | "untested" | "running" | "skipped";
  size?: "sm" | "md";
  pulse?: boolean;
}

const statusColors: Record<string, string> = {
  pass: "bg-orbit-pass",
  fail: "bg-orbit-fail",
  flaky: "bg-orbit-flaky",
  untested: "bg-orbit-untested",
  running: "bg-orbit-accent",
  skipped: "bg-muted-foreground",
};

const glowIntensity: Record<string, string> = {
  pass: "shadow-[0_0_6px_hsl(var(--orbit-pass)/0.4)]",
  fail: "shadow-[0_0_8px_hsl(var(--orbit-fail)/0.6)]",
  flaky: "shadow-[0_0_7px_hsl(var(--orbit-flaky)/0.5)]",
  running: "shadow-[0_0_8px_hsl(var(--orbit-accent)/0.6)]",
};

export function StatusDot({ status, size = "sm", pulse }: StatusDotProps) {
  const isRunning = status === "running";
  const shouldPulse = pulse || isRunning;
  const dim = size === "sm" ? "h-2 w-2" : "h-3 w-3";

  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "inline-block rounded-full",
          statusColors[status],
          glowIntensity[status],
          dim,
        )}
      />
      {/* Primary ping ring */}
      {shouldPulse && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-75",
            statusColors[status],
            dim,
          )}
        />
      )}
      {/* Secondary ring — offset timing for running state */}
      {isRunning && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-40",
            statusColors[status],
            dim,
          )}
          style={{ animationDelay: "0.5s" }}
        />
      )}
    </span>
  );
}
