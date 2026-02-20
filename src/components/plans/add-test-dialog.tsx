"use client";

import { useState, useCallback } from "react";
import { Plus, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface AddTestDialogProps {
  projectId: string;
  planId?: string;
  onSaved: () => void;
  onClose: () => void;
}

const TEST_TYPES = [
  { value: "journey", label: "Journey" },
  { value: "api_contract", label: "API" },
  { value: "auth", label: "Auth" },
  { value: "form_validation", label: "Form" },
  { value: "edge_case", label: "Edge Case" },
  { value: "regression", label: "Regression" },
];

export function AddTestDialog({ projectId, planId, onSaved, onClose }: AddTestDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("journey");
  const [journey, setJourney] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [priorityScore, setPriorityScore] = useState(50);
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("Test case name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/plan/add-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          name: name.trim(),
          type,
          journey: journey.trim() || undefined,
          rationale: rationale.trim() || undefined,
          isCritical,
          priorityScore,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? "Failed to add test case");
        return;
      }

      onSaved();
    } catch {
      setError("Failed to add test case");
    } finally {
      setSaving(false);
    }
  }, [name, type, journey, isCritical, priorityScore, rationale, projectId, planId, onSaved]);

  return (
    <div className="rounded-xl surface-1 border border-orbit-accent/20 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] bg-orbit-accent/5">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-orbit-accent" />
          <span className="text-sm font-medium text-foreground">Add Test Case</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 px-2">
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-7 bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
          >
            <Save className="h-3 w-3" />
            {saving ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {error && (
          <div className="text-xs text-orbit-fail bg-orbit-fail/10 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., User can reset password"
              className="bg-white/[0.04]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Journey</Label>
            <Input
              value={journey}
              onChange={(e) => setJourney(e.target.value)}
              placeholder="e.g., Authentication"
              className="bg-white/[0.04]"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 rounded-md border border-transparent bg-white/[0.04] px-3 text-sm focus:border-orbit-accent/30 focus:outline-none"
            >
              {TEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Priority (0-100)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={priorityScore}
              onChange={(e) => setPriorityScore(parseInt(e.target.value, 10) || 0)}
              className="bg-white/[0.04] w-24"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch checked={isCritical} onCheckedChange={setIsCritical} className="scale-75" />
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Rationale</Label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className={cn(
              "w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2",
              "text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-orbit-accent resize-y"
            )}
            placeholder="Why this test case is needed..."
          />
        </div>
      </div>
    </div>
  );
}
