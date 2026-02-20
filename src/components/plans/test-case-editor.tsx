"use client";

import { useState, useCallback } from "react";
import { Save, X, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TEST_TYPE_CONFIG } from "@/components/plans/plan-types";

interface TestCaseEditorProps {
  projectId: string;
  testCase: {
    id: string;
    name: string;
    type: string;
    journey: string | null;
    priorityScore: number;
    steps: unknown;
    rationale: string | null;
    edgeCases: unknown;
    isEnabled: boolean;
    isCritical: boolean;
  };
  onSave: () => void;
  onClose: () => void;
}

export function TestCaseEditor({
  projectId,
  testCase,
  onSave,
  onClose,
}: TestCaseEditorProps) {
  const [name, setName] = useState(testCase.name);
  const [journey, setJourney] = useState(testCase.journey ?? "");
  const [priorityScore, setPriorityScore] = useState(testCase.priorityScore);
  const [isEnabled, setIsEnabled] = useState(testCase.isEnabled);
  const [isCritical, setIsCritical] = useState(testCase.isCritical);
  const [rationale, setRationale] = useState(testCase.rationale ?? "");
  const [steps, setSteps] = useState<string[]>(parseSteps(testCase.steps));
  const [edgeCases, setEdgeCases] = useState<string[]>(
    parseEdgeCases(testCase.edgeCases)
  );
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
      const res = await fetch(
        `/api/projects/${projectId}/test-cases/${testCase.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            journey: journey.trim() || null,
            priorityScore,
            isEnabled,
            isCritical,
            rationale: rationale.trim() || null,
            steps: steps.filter((s) => s.trim()),
            edgeCases: edgeCases.filter((e) => e.trim()),
          }),
        }
      );

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? "Failed to save");
        return;
      }

      onSave();
    } catch {
      setError("Failed to save test case");
    } finally {
      setSaving(false);
    }
  }, [name, journey, priorityScore, isEnabled, isCritical, rationale, steps, edgeCases, projectId, testCase.id, onSave]);

  return (
    <div className="rounded-xl surface-1 border border-orbit-accent/20 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] bg-orbit-accent/5">
        <span className="text-sm font-medium text-foreground">Edit Test Case</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 px-2"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-7 bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save"}
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
          <div className="flex items-center gap-4 pt-5">
            <div className="flex items-center gap-2">
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} className="scale-75" />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isCritical} onCheckedChange={setIsCritical} className="scale-75" />
              <span className="text-xs text-muted-foreground">Critical</span>
            </div>
          </div>
          <div className="pt-5">
            <Badge className={cn("text-[10px]", TEST_TYPE_CONFIG[testCase.type]?.className)}>
              {TEST_TYPE_CONFIG[testCase.type]?.label ?? testCase.type}
            </Badge>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Rationale</Label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orbit-accent resize-y"
            placeholder="Why this test case exists..."
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Steps</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => setSteps([...steps, ""])}
            >
              <Plus className="h-3 w-3" /> Add Step
            </Button>
          </div>
          <div className="space-y-1.5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                <span className="text-[11px] text-muted-foreground tabular-nums w-5 shrink-0">
                  {i + 1}.
                </span>
                <Input
                  value={step}
                  onChange={(e) => {
                    const updated = [...steps];
                    updated[i] = e.target.value;
                    setSteps(updated);
                  }}
                  className="bg-white/[0.04] text-xs"
                  placeholder={`Step ${i + 1}...`}
                />
                <button
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                  className="text-muted-foreground/50 hover:text-orbit-fail shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Edge Cases</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => setEdgeCases([...edgeCases, ""])}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="space-y-1.5">
            {edgeCases.map((ec, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={ec}
                  onChange={(e) => {
                    const updated = [...edgeCases];
                    updated[i] = e.target.value;
                    setEdgeCases(updated);
                  }}
                  className="bg-white/[0.04] text-xs"
                  placeholder="Edge case description..."
                />
                <button
                  onClick={() => setEdgeCases(edgeCases.filter((_, j) => j !== i))}
                  className="text-muted-foreground/50 hover:text-orbit-fail shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseSteps(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((s) =>
    typeof s === "string" ? s : (s as { action?: string })?.action ?? JSON.stringify(s)
  );
}

function parseEdgeCases(edgeCases: unknown): string[] {
  if (!Array.isArray(edgeCases)) return [];
  return edgeCases.filter((e): e is string => typeof e === "string");
}
