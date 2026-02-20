import { cn } from "@/lib/utils";

interface HealthBadgeProps {
  status: "healthy" | "degraded" | "failing";
}

const statusConfig = {
  healthy: {
    label: "Healthy",
    dot: "bg-orbit-pass",
    text: "text-orbit-pass",
  },
  degraded: {
    label: "Degraded",
    dot: "bg-orbit-flaky",
    text: "text-orbit-flaky",
  },
  failing: {
    label: "Failing",
    dot: "bg-orbit-fail",
    text: "text-orbit-fail",
  },
};

export function HealthBadge({ status }: HealthBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.04]",
        config.text
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", config.dot)}
        style={{ boxShadow: `0 0 6px currentColor` }}
      />
      {config.label}
    </div>
  );
}
