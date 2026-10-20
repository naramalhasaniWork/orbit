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

// Hairline cells; only a real problem (danger) changes colour, and only the number's border.
const variantStyles = {
  default: "bg-card border-border",
  accent: "bg-card border-border",
  warning: "bg-card border-border",
  danger: "bg-card border-tm-fail/50",
};

const iconVariants = {
  default: "text-tm-t3",
  accent: "text-tm-t3",
  warning: "text-tm-t3",
  danger: "text-tm-fail",
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
        "rounded-lg border p-4",
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
