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

export function StatusDot({ status, size = "sm", pulse }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full",
        statusColors[status],
        size === "sm" ? "h-2 w-2" : "h-3 w-3",
        pulse && "animate-pulse"
      )}
    />
  );
}
