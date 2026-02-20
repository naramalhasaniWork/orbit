"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface FeatureFlagToggleProps {
  name: string;
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  loading?: boolean;
}

export function FeatureFlagToggle({
  name,
  label,
  description,
  enabled,
  onToggle,
  loading,
}: FeatureFlagToggleProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-lg border transition-colors",
        enabled
          ? "border-orbit-accent/20 bg-orbit-accent/5"
          : "border-white/[0.06] bg-white/[0.02]"
      )}
    >
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => onToggle(name, checked)}
        disabled={loading}
      />
    </div>
  );
}
