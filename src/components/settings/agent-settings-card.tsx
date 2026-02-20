"use client";

import { useState } from "react";
import { Microscope, Brain, PlayCircle, FileText, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const AGENT_ICONS: Record<string, LucideIcon> = {
  analyst: Microscope,
  planner: Brain,
  executor: PlayCircle,
  reporter: FileText,
};

const AGENT_LABELS: Record<string, string> = {
  analyst: "Analyst Agent",
  planner: "Planner Agent",
  executor: "Executor Agent",
  reporter: "Reporter Agent",
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  analyst: "Indexes repos, detects frameworks, builds the System Map",
  planner: "Generates test plans from the System Map",
  executor: "Runs browser-based tests via Playwright + Stagehand",
  reporter: "Analyzes failures and generates reports",
};

const MODEL_OPTIONS = [
  { value: "claude-3-5-haiku-20241022", label: "Claude Haiku" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet" },
  { value: "claude-opus-4-20250514", label: "Claude Opus" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
];

export interface AgentConfigData {
  agentPhase: string;
  model: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  customPrompt: string | null;
  isEnabled: boolean;
}

interface AgentSettingsCardProps {
  config: AgentConfigData;
  workspaceId: string;
  onSaved: () => void;
}

export function AgentSettingsCard({ config, workspaceId, onSaved }: AgentSettingsCardProps) {
  const [model, setModel] = useState(config.model);
  const [temperature, setTemperature] = useState(config.temperature);
  const [maxInputTokens, setMaxInputTokens] = useState(config.maxInputTokens);
  const [maxOutputTokens, setMaxOutputTokens] = useState(config.maxOutputTokens);
  const [customPrompt, setCustomPrompt] = useState(config.customPrompt ?? "");
  const [isEnabled, setIsEnabled] = useState(config.isEnabled);
  const [saving, setSaving] = useState(false);

  const Icon = AGENT_ICONS[config.agentPhase] ?? FileText;
  const label = AGENT_LABELS[config.agentPhase] ?? config.agentPhase;
  const description = AGENT_DESCRIPTIONS[config.agentPhase] ?? "";

  const hasChanges =
    model !== config.model ||
    temperature !== config.temperature ||
    maxInputTokens !== config.maxInputTokens ||
    maxOutputTokens !== config.maxOutputTokens ||
    (customPrompt || null) !== config.customPrompt ||
    isEnabled !== config.isEnabled;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentPhase: config.agentPhase,
          model,
          temperature,
          maxInputTokens,
          maxOutputTokens,
          customPrompt: customPrompt || null,
          isEnabled,
        }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
            <Icon className="w-4.5 h-4.5 text-orbit-accent" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`enabled-${config.agentPhase}`} className="text-xs text-muted-foreground">
            {isEnabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id={`enabled-${config.agentPhase}`}
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Model</Label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-orbit-accent appearance-none cursor-pointer"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#1a1a2e] text-foreground">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Temperature: {temperature.toFixed(1)}
          </Label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/[0.08] accent-orbit-accent"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Precise (0.0)</span>
            <span>Creative (1.0)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`input-${config.agentPhase}`} className="text-xs text-muted-foreground">
            Max Input Tokens
          </Label>
          <Input
            id={`input-${config.agentPhase}`}
            type="number"
            value={maxInputTokens}
            onChange={(e) => setMaxInputTokens(parseInt(e.target.value) || 0)}
            className="bg-white/[0.04]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`output-${config.agentPhase}`} className="text-xs text-muted-foreground">
            Max Output Tokens
          </Label>
          <Input
            id={`output-${config.agentPhase}`}
            type="number"
            value={maxOutputTokens}
            onChange={(e) => setMaxOutputTokens(parseInt(e.target.value) || 0)}
            className="bg-white/[0.04]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Custom Instructions</Label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Additional instructions for this agent..."
          rows={3}
          className="w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orbit-accent resize-y"
        />
      </div>

      <div className="pt-1">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          size="sm"
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
