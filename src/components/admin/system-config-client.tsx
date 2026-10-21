"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FeatureFlagToggle } from "@/components/admin/feature-flag-toggle";
import {
  Settings,
  Bell,
  AlertTriangle,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FLAG_LABELS: Record<string, { label: string; description: string }> = {
  self_healing: { label: "Self-Healing", description: "Repair broken selectors with AI during runs" },
  ai_suggestions: { label: "AI Suggestions", description: "Generate test suggestions on the Test Plans page" },
  parallel_execution: { label: "Parallel Execution", description: "Partition full and smoke runs across parallel browsers" },
  visual_regression: { label: "Visual Regression", description: "Add one screenshot-comparison case per route group to generated plans" },
};

interface SystemConfigClientProps {
  featureFlags: Record<string, boolean>;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  systemAnnouncement: string;
}

export function SystemConfigClient({
  featureFlags: initialFlags,
  maintenanceMode: initialMaintenance,
  maintenanceMessage: initialMaintenanceMsg,
  systemAnnouncement: initialAnnouncement,
}: SystemConfigClientProps) {
  const [featureFlags, setFeatureFlags] = useState(initialFlags);
  const [maintenanceMode, setMaintenanceMode] = useState(initialMaintenance);
  const [maintenanceMessage, setMaintenanceMessage] = useState(initialMaintenanceMsg);
  const [systemAnnouncement, setSystemAnnouncement] = useState(initialAnnouncement);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    // The API stores one config key per request.
    const entries: Array<[string, unknown]> = [
      ["feature_flags", featureFlags],
      ["maintenance_mode", maintenanceMode],
      ["maintenance_message", maintenanceMessage],
      ["system_announcement", systemAnnouncement],
    ];
    try {
      for (const [key, value] of entries) {
        const res = await fetch("/api/admin/system", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(`Failed to save ${key}: ${json?.error?.message ?? res.statusText}`);
        }
      }
      setStatus({ ok: true, message: "Saved" });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-foreground">System Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Platform-wide feature flags, maintenance mode, and announcements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={cn("text-xs", status.ok ? "text-orbit-pass" : "text-tm-fail")} role="status">
              {status.message}
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="rounded-xl surface-1 border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-medium text-foreground">Feature Flags</h3>
        </div>
        <div className="space-y-3">
          {Object.entries(featureFlags).map(([key, enabled]) => {
            const meta = FLAG_LABELS[key] ?? { label: key, description: "" };
            return (
              <FeatureFlagToggle
                key={key}
                name={key}
                label={meta.label}
                description={meta.description}
                enabled={enabled}
                onToggle={(name, value) =>
                  setFeatureFlags((prev) => ({ ...prev, [name]: value }))
                }
              />
            );
          })}
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className="rounded-xl surface-1 border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn("h-4 w-4", maintenanceMode ? "text-orbit-fail" : "text-muted-foreground")} />
            <h3 className="text-sm font-medium text-foreground">Maintenance Mode</h3>
            {maintenanceMode && (
              <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                ACTIVE
              </Badge>
            )}
          </div>
          <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
        </div>
        {maintenanceMode && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Maintenance Message</Label>
            <Input
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="We are performing scheduled maintenance..."
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* System Announcement */}
      <div className="rounded-xl surface-1 border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-medium text-foreground">System Announcement</h3>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Shown as a banner across the dashboard (leave empty to hide)
          </Label>
          <Input
            value={systemAnnouncement}
            onChange={(e) => setSystemAnnouncement(e.target.value)}
            placeholder="Important announcement..."
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
