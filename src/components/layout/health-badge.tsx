import { cn } from "@/lib/utils";

interface HealthBadgeProps {
  status: "healthy" | "degraded" | "failing";
}

const statusConfig = {
  healthy: {
    label: "Healthy",
    dot: "bg-orbit-pass",
    text: "text-orbit-pass",
    glow: "shadow-[0_0_8px_hsl(var(--orbit-pass)/0.4)]",
    bg: "bg-orbit-pass/[0.08]",
  },
  degraded: {
    label: "Degraded",
    dot: "bg-orbit-flaky",
    text: "text-orbit-flaky",
    glow: "shadow-[0_0_8px_hsl(var(--orbit-flaky)/0.4)]",
    bg: "bg-orbit-flaky/[0.08]",
  },
  failing: {
    label: "Failing",
    dot: "bg-orbit-fail",
    text: "text-orbit-fail",
    glow: "shadow-[0_0_8px_hsl(var(--orbit-fail)/0.4)]",
    bg: "bg-orbit-fail/[0.08]",
  },
};

export function HealthBadge({ status }: HealthBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
        config.bg,
        config.text
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", config.dot, config.glow)}
      />
      {config.label}
    </div>
  );
}
