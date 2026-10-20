"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ModelOption {
  modelId: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isRecommended: boolean;
  recommendedFor: string[];
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

const RECOMMENDED_MODELS: Record<string, string[]> = {
  analyst: ["claude-haiku-4-5-20251001", "o4-mini"],
  planner: ["claude-sonnet-4-6", "gpt-4.1"],
  executor: ["claude-sonnet-4-6", "gpt-4.1"],
  reporter: ["claude-haiku-4-5-20251001", "gpt-4.1"],
  auditor: ["claude-opus-4-6", "gpt-5.2"],
};

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

function getPriceTier(costPer1M: number): string {
  if (costPer1M <= 0.5) return "$";
  if (costPer1M <= 5) return "$$";
  return "$$$";
}

interface ModelSelectorEnhancedProps {
  workspaceId: string;
  value: string;
  onChange: (modelId: string) => void;
  agentPhase?: string;
}

export function ModelSelectorEnhanced({
  workspaceId,
  value,
  onChange,
  agentPhase,
}: ModelSelectorEnhancedProps) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/models`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setModels(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const recommended = agentPhase ? (RECOMMENDED_MODELS[agentPhase] ?? []) : [];

  const filtered = useMemo(() => {
    if (!search) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  }, [models, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};
    for (const m of filtered) {
      const key = m.provider;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    return groups;
  }, [filtered]);

  const selectedModel = models.find((m) => m.modelId === value);
  const selectedLabel = selectedModel?.displayName ?? value;

  if (loading) {
    return (
      <div className="h-9 rounded-md bg-foreground/[0.04] border border-transparent" />
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-md bg-foreground/[0.04] border border-transparent px-3 py-2 text-sm text-foreground hover:border-border focus:outline-none focus:ring-1 focus-visible:ring-ring transition-colors"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Close on outside click - rendered before dropdown so z-order is correct */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setOpen(false); setSearch(""); }}
        />
      )}

      {open && (
        <div className="absolute z-modal mt-1 w-full rounded-lg border border-border bg-card shadow-2xl shadow-black/40 overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-md bg-foreground/[0.04] border border-transparent pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus-visible:ring-ring"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {Object.entries(grouped).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No models found</p>
            )}
            {Object.entries(grouped).map(([provider, providerModels]) => (
              <div key={provider}>
                <div className="px-3 py-1.5 tm-label text-muted-foreground">
                  {PROVIDER_LABELS[provider] ?? provider}
                </div>
                {providerModels.map((model) => {
                  const isRecommended = recommended.includes(model.modelId);
                  const isSelected = model.modelId === value;

                  return (
                    <button
                      key={model.modelId}
                      type="button"
                      onClick={() => {
                        onChange(model.modelId);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-foreground/[0.06] text-foreground"
                          : "text-foreground hover:bg-foreground/[0.04]"
                      }`}
                    >
                      <span className="flex-1 truncate">{model.displayName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {formatContextWindow(model.contextWindow)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {getPriceTier(model.inputCostPer1M)}
                      </span>
                      {isRecommended && (
                        <Badge variant="accent" className="text-[9px] px-1.5 py-0">
                          Rec
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
