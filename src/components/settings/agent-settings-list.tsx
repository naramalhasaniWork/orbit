"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { AgentSettingsCard } from "./agent-settings-card";
import type { AgentConfigData } from "./agent-settings-card";

const AGENT_PHASES = ["analyst", "planner", "executor", "reporter"] as const;

const DEFAULT_CONFIGS: AgentConfigData[] = AGENT_PHASES.map((phase) => ({
  agentPhase: phase,
  model: "claude-sonnet-4-6",
  temperature: 0.2,
  maxInputTokens: 100000,
  maxOutputTokens: 4096,
  customPrompt: null,
  isEnabled: true,
}));

interface AgentSettingsListProps {
  workspaceId: string;
}

export function AgentSettingsList({ workspaceId }: AgentSettingsListProps) {
  const [configs, setConfigs] = useState<AgentConfigData[]>(DEFAULT_CONFIGS);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent-config`);
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        // Merge fetched configs with defaults for any missing phases
        const fetched = json.data as AgentConfigData[];
        const merged = AGENT_PHASES.map((phase) => {
          const found = fetched.find((c) => c.agentPhase === phase);
          return found ?? DEFAULT_CONFIGS.find((d) => d.agentPhase === phase)!;
        });
        setConfigs(merged);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">Agent Configuration</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure model, temperature, and behavior for each AI agent.
        </p>
      </div>
      {configs.map((config) => (
        <AgentSettingsCard
          key={config.agentPhase}
          config={config}
          workspaceId={workspaceId}
          onSaved={fetchConfigs}
        />
      ))}
    </div>
  );
}
