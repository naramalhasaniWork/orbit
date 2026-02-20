import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "pass" | "fail" | "flaky" | "untested" | "running" | "skipped";
  size?: "sm" | "md";
  pulse?: boolean;
}

const statusColors = {
  pass: "bg-orbit-pass",
  fail: "bg-orbit-fail",
  flaky: "bg-orbit-flaky",
  untested: "bg-orbit-untested",
  running: "bg-orbit-accent",
  skipped: "bg-muted-foreground",
};

const glowColors: Record<string, string> = {
  pass: "shadow-[0_0_6px_hsl(var(--orbit-pass)/0.5)]",
  fail: "shadow-[0_0_6px_hsl(var(--orbit-fail)/0.5)]",
  flaky: "shadow-[0_0_6px_hsl(var(--orbit-flaky)/0.5)]",
  running: "shadow-[0_0_6px_hsl(var(--orbit-accent)/0.5)]",
};

export function StatusDot({ status, size = "sm", pulse }: StatusDotProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "inline-block rounded-full",
          statusColors[status],
          glowColors[status],
          size === "sm" ? "h-2 w-2" : "h-3 w-3",
        )}
      />
      {pulse && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-75",
            statusColors[status],
            size === "sm" ? "h-2 w-2" : "h-3 w-3",
          )}
        />
      )}
    </span>
  );
}
