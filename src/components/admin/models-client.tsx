"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/admin/data-table";
import { ModelUsageStats } from "@/components/admin/model-usage-stats";
import { RefreshCw, Search } from "lucide-react";

interface ModelPolicy {
  id: string;
  modelId: string;
  provider: string;
  isAllowed: boolean;
  requiredTier: string | null;
  maxTemperature: number | null;
  requiresApproval: boolean;
  notes: string | null;
}

export interface ModelEntry {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isActive: boolean;
  policy: ModelPolicy | null;
  usage: { totalTokens: number; calls: number };
}

interface ModelsClientProps {
  initialModels: ModelEntry[];
  initialTotal: number;
  initialProviders: string[];
}

function formatCost(cost: number): string {
  if (cost === 0) return "Free";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function makeDefaultPolicy(modelId: string, provider: string, overrides: Partial<ModelPolicy> = {}): ModelPolicy {
  return { id: "", modelId, provider, isAllowed: true, requiredTier: null, maxTemperature: null, requiresApproval: false, notes: null, ...overrides };
}

export function ModelsClient({ initialModels, initialTotal, initialProviders }: ModelsClientProps) {
  const [models, setModels] = useState(initialModels);
  const [total, setTotal] = useState(initialTotal);
  const [providers] = useState(initialProviders);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [togglingModel, setTogglingModel] = useState<string | null>(null);

  const fetchModels = useCallback(async (p: number, s: string, prov: string) => {
    const params = new URLSearchParams({ page: String(p), limit: "50" });
    if (s) params.set("search", s);
    if (prov) params.set("provider", prov);
    const res = await fetch(`/api/admin/models?${params}`);
    const json = await res.json();
    if (json.success) {
      setModels(json.data.models);
      setTotal(json.data.total);
    }
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/models/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSyncResult(`Synced ${json.data.total} models (${json.data.created} new, ${json.data.updated} updated)`);
        fetchModels(1, search, providerFilter);
        setPage(1);
      } else {
        setSyncResult(`Error: ${json.error?.message ?? "Unknown error"}`);
      }
    } catch {
      setSyncResult("Failed to sync models");
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleAllow(model: ModelEntry) {
    setTogglingModel(`${model.provider}:${model.modelId}`);
    try {
      const newAllowed = !(model.policy?.isAllowed ?? true);
      await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.modelId, provider: model.provider, isAllowed: newAllowed }),
      });
      setModels((prev) =>
        prev.map((m) => m.id === model.id
          ? { ...m, policy: m.policy ? { ...m.policy, isAllowed: newAllowed } : makeDefaultPolicy(m.modelId, m.provider, { isAllowed: newAllowed }) }
          : m
        )
      );
    } finally {
      setTogglingModel(null);
    }
  }

  async function handleTierChange(model: ModelEntry, tier: string) {
    const value = tier === "none" ? null : tier;
    await fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: model.modelId, provider: model.provider, isAllowed: model.policy?.isAllowed ?? true, requiredTier: value }),
    });
    setModels((prev) =>
      prev.map((m) => m.id === model.id
        ? { ...m, policy: m.policy ? { ...m.policy, requiredTier: value } : makeDefaultPolicy(m.modelId, m.provider, { requiredTier: value }) }
        : m
      )
    );
  }

  const columns = [
    {
      key: "name", header: "Model",
      render: (row: ModelEntry) => (
        <div>
          <span className="text-sm font-medium text-foreground">{row.displayName}</span>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{row.modelId}</p>
        </div>
      ),
    },
    {
      key: "provider", header: "Provider",
      render: (row: ModelEntry) => <span className="text-xs text-muted-foreground capitalize">{row.provider}</span>,
    },
    {
      key: "context", header: "Context",
      render: (row: ModelEntry) => <span className="text-xs text-muted-foreground">{row.contextWindow > 0 ? formatTokens(row.contextWindow) : "--"}</span>,
    },
    {
      key: "cost", header: "Cost (per 1M)",
      render: (row: ModelEntry) => (
        <div className="text-xs text-muted-foreground">
          <span>In: {formatCost(row.inputCostPer1M)}</span>
          <span className="mx-1">/</span>
          <span>Out: {formatCost(row.outputCostPer1M)}</span>
        </div>
      ),
    },
    {
      key: "status", header: "Status",
      render: (row: ModelEntry) => {
        const allowed = row.policy?.isAllowed ?? true;
        return (
          <div className="flex items-center gap-2">
            <Switch checked={allowed} onCheckedChange={() => handleToggleAllow(row)} disabled={togglingModel === `${row.provider}:${row.modelId}`} />
            <Badge variant={allowed ? "pass" : "destructive"}>{allowed ? "Allowed" : "Blocked"}</Badge>
          </div>
        );
      },
    },
    {
      key: "tier", header: "Tier",
      render: (row: ModelEntry) => (
        <Select value={row.policy?.requiredTier ?? "none"} onValueChange={(v) => handleTierChange(row, v)}>
          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Any</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="professional">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "usage", header: "Usage (30d)",
      render: (row: ModelEntry) => (
        <span className="text-xs text-muted-foreground">{row.usage.totalTokens > 0 ? `${formatTokens(row.usage.totalTokens)} tokens` : "--"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Model Registry</h2>
          <p className="text-sm text-muted-foreground">Manage available AI models, access policies, and tier restrictions.</p>
        </div>
        <Button onClick={handleSync} disabled={syncing} size="sm">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from OpenRouter"}
        </Button>
      </div>

      {syncResult && (
        <div className="rounded-lg border border-border bg-foreground/[0.02] px-4 py-2 text-sm text-muted-foreground">{syncResult}</div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); fetchModels(1, e.target.value, providerFilter); }} placeholder="Search models..." className="pl-9 bg-foreground/[0.03] border-border" />
        </div>
        <Select value={providerFilter || "all"} onValueChange={(v) => { const prov = v === "all" ? "" : v; setProviderFilter(prov); setPage(1); fetchModels(1, search, prov); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All providers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={models} total={total} page={page} limit={50} onPageChange={(p) => { setPage(p); fetchModels(p, search, providerFilter); }} />

      <ModelUsageStats models={models} />
    </div>
  );
}
