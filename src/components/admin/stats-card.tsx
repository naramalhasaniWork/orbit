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
  accent: "bg-foreground/[0.06] border-tm-line-strong",
  warning: "bg-tm-warn/5 border-tm-warn/10",
  danger: "bg-tm-fail/5 border-tm-fail/10",
};

const iconVariants = {
  default: "bg-muted/50 text-muted-foreground",
  accent: "bg-foreground/[0.06] text-foreground",
  warning: "bg-tm-warn/15 text-tm-warn",
  danger: "bg-tm-fail/15 text-tm-fail",
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
          <p className="text-2xl font-medium tracking-display">{value}</p>
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
              trend.value >= 0 ? "text-tm-pass" : "text-tm-fail"
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
