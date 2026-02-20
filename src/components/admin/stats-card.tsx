import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: "default" | "accent" | "warning" | "danger";
}

const variantStyles = {
  default: "bg-muted/30 border-border",
  accent: "bg-orbit-accent/5 border-orbit-accent/10",
  warning: "bg-amber-500/5 border-amber-500/10",
  danger: "bg-red-500/5 border-red-500/10",
};

const iconVariants = {
  default: "bg-muted/50 text-muted-foreground",
  accent: "bg-orbit-accent/15 text-orbit-accent",
  warning: "bg-amber-500/15 text-amber-400",
  danger: "bg-red-500/15 text-red-400",
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-lg",
            iconVariants[variant]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "font-medium",
              trend.value >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}%
          </span>
          <span className="text-muted-foreground">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
