"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduledRun {
  id: string;
  name: string;
  cronExpression: string;
  mode: string;
  environmentId: string | null;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface ScheduleSettingsProps {
  projectId: string | null;
}

const MODE_LABELS: Record<string, string> = {
  smoke: "Smoke",
  full: "Full Suite",
  regression: "Regression",
};

const CRON_PRESETS = [
  { label: "Every night at 2am", value: "0 2 * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every Sunday at 3am", value: "0 3 * * 0" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
  { label: "Every hour", value: "0 * * * *" },
];

export function ScheduleSettings({ projectId }: ScheduleSettingsProps) {
  const [schedules, setSchedules] = useState<ScheduledRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: "",
    cronExpression: "0 2 * * *",
    mode: "smoke",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    async function fetchSchedules() {
      try {
        const res = await fetch(`/api/projects/${projectId}/schedules`);
        if (res.ok) {
          const json = await res.json();
          setSchedules(json.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSchedules();
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  async function handleCreate() {
    if (!newSchedule.name || !newSchedule.cronExpression) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSchedule),
      });
      if (res.ok) {
        const json = await res.json();
        setSchedules((prev) => [...prev, json.data]);
        setNewSchedule({ name: "", cronExpression: "0 2 * * *", mode: "smoke" });
        setShowAdd(false);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(scheduleId: string, isEnabled: boolean) {
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? { ...s, isEnabled } : s))
    );
    await fetch(`/api/projects/${projectId}/schedules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId, isEnabled }),
    });
  }

  async function handleDelete(scheduleId: string) {
    const res = await fetch(`/api/projects/${projectId}/schedules?scheduleId=${scheduleId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Scheduled Runs</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatically run tests on a schedule.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Schedule
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-xl surface-1 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                placeholder="Nightly Smoke"
                value={newSchedule.name}
                onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                className="bg-foreground/[0.04]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cron Expression</Label>
              <Input
                placeholder="0 2 * * *"
                value={newSchedule.cronExpression}
                onChange={(e) => setNewSchedule({ ...newSchedule, cronExpression: e.target.value })}
                className="bg-foreground/[0.04] font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <select
                value={newSchedule.mode}
                onChange={(e) => setNewSchedule({ ...newSchedule, mode: e.target.value })}
                className="w-full h-9 rounded-md border border-transparent bg-foreground/[0.04] px-3 text-sm focus-visible:border-tm-t3 focus:outline-none"
              >
                <option value="smoke">Smoke Test</option>
                <option value="full">Full Suite</option>
                <option value="regression">Regression</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() =>
                  setNewSchedule({
                    ...newSchedule,
                    cronExpression: preset.value,
                    name: newSchedule.name || preset.label,
                  })
                }
                className={cn(
                  "text-[11px] px-2 py-1 rounded-md transition-colors",
                  newSchedule.cronExpression === preset.value
                    ? "bg-foreground/[0.06] text-foreground"
                    : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newSchedule.name}
              className="bg-primary hover:bg-primary/85 text-primary-foreground"
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <div className="h-4 w-32 bg-foreground/[0.06] rounded mx-auto" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No scheduled runs configured.
            </p>
          </div>
        ) : (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl surface-1"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={schedule.isEnabled}
                  onCheckedChange={(checked) => handleToggle(schedule.id, checked)}
                  className="scale-75"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {schedule.name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {MODE_LABELS[schedule.mode] ?? schedule.mode}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{schedule.cronExpression}</span>
                    {schedule.nextRunAt && (
                      <span>
                        Next: {new Date(schedule.nextRunAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-tm-fail"
                onClick={() => handleDelete(schedule.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
