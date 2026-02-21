"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, Check, X, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", defaultUrl: "https://api.anthropic.com" },
  { id: "openai", label: "OpenAI", defaultUrl: "https://api.openai.com" },
  { id: "openrouter", label: "OpenRouter", defaultUrl: "https://openrouter.ai/api" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

interface ProviderData {
  provider: ProviderId;
  hasKey: boolean;
  baseUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface ProviderCardState {
  apiKey: string;
  baseUrl: string;
  isActive: boolean;
  isDefault: boolean;
  showKey: boolean;
  saving: boolean;
  testing: boolean;
  testResult: { ok: boolean; latencyMs?: number; error?: string } | null;
}

interface ProviderSettingsProps {
  workspaceId: string;
}

export function ProviderSettings({ workspaceId }: ProviderSettingsProps) {
  const [providers, setProviders] = useState<Record<ProviderId, ProviderData | null>>({
    anthropic: null,
    openai: null,
    openrouter: null,
  });
  const [cards, setCards] = useState<Record<ProviderId, ProviderCardState>>(() =>
    Object.fromEntries(
      PROVIDERS.map((p) => [
        p.id,
        { apiKey: "", baseUrl: "", isActive: false, isDefault: false, showKey: false, saving: false, testing: false, testResult: null },
      ])
    ) as Record<ProviderId, ProviderCardState>
  );
  const [loading, setLoading] = useState(true);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/providers`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) return;

      const fetched = json.data as ProviderData[];
      const map: Record<string, ProviderData> = {};
      for (const p of fetched) map[p.provider] = p;

      setProviders((prev) => ({ ...prev, ...map }));
      setCards((prev) => {
        const next = { ...prev };
        for (const p of fetched) {
          next[p.provider as ProviderId] = {
            ...next[p.provider as ProviderId],
            baseUrl: p.baseUrl ?? "",
            isActive: p.isActive,
            isDefault: p.isDefault,
            apiKey: "",
            testResult: null,
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  function updateCard(id: ProviderId, patch: Partial<ProviderCardState>) {
    setCards((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleSave(providerId: ProviderId) {
    const card = cards[providerId];
    const data = providers[providerId];
    updateCard(providerId, { saving: true });
    try {
      const body: Record<string, unknown> = {
        isActive: card.isActive,
        isDefault: card.isDefault,
      };
      if (card.apiKey) body.apiKey = card.apiKey;
      if (card.baseUrl) body.baseUrl = card.baseUrl;

      // If provider doesn't exist yet, POST to create it; otherwise PUT to update
      const isNew = !data;
      const url = isNew
        ? `/api/workspaces/${workspaceId}/providers`
        : `/api/workspaces/${workspaceId}/providers/${providerId}`;
      const method = isNew ? "POST" : "PUT";

      if (isNew) {
        body.provider = providerId;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        updateCard(providerId, { apiKey: "" });
        await fetchProviders();
      }
    } finally {
      updateCard(providerId, { saving: false });
    }
  }

  async function handleTest(providerId: ProviderId) {
    updateCard(providerId, { testing: true, testResult: null });
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/providers/${providerId}/test`,
        { method: "POST" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        updateCard(providerId, { testResult: { ok: true, latencyMs: json.data?.latencyMs } });
      } else {
        updateCard(providerId, { testResult: { ok: false, error: json.error?.message ?? "Connection failed" } });
      }
    } catch {
      updateCard(providerId, { testResult: { ok: false, error: "Network error" } });
    } finally {
      updateCard(providerId, { testing: false });
    }
  }

  async function handleSetDefault(providerId: ProviderId) {
    updateCard(providerId, { saving: true });
    try {
      await fetch(`/api/workspaces/${workspaceId}/providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      await fetchProviders();
    } finally {
      updateCard(providerId, { saving: false });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {PROVIDERS.map((p) => (
          <Skeleton key={p.id} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map((provider) => {
        const data = providers[provider.id];
        const card = cards[provider.id];
        const status = data?.hasKey
          ? data.isActive ? "connected" : "disabled"
          : "not_configured";

        return (
          <div key={provider.id} className="rounded-xl surface-1 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <StatusDot status={status} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">{provider.label}</h3>
                    {data?.isDefault && <Badge variant="accent" className="text-[10px]">Default</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {status === "connected" ? "Connected" : status === "disabled" ? "Disabled" : "Not configured"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`active-${provider.id}`} className="text-xs text-muted-foreground">
                  {card.isActive ? "Enabled" : "Disabled"}
                </Label>
                <Switch
                  id={`active-${provider.id}`}
                  checked={card.isActive}
                  onCheckedChange={(v) => updateCard(provider.id, { isActive: v })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <div className="relative">
                  <Input
                    type={card.showKey ? "text" : "password"}
                    value={card.apiKey}
                    onChange={(e) => updateCard(provider.id, { apiKey: e.target.value })}
                    placeholder={data?.hasKey ? "REDACTEDREDACTED** (key saved)" : "sk-..."}
                    className="bg-white/[0.04] pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => updateCard(provider.id, { showKey: !card.showKey })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {card.showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Base URL (optional)</Label>
                <Input
                  value={card.baseUrl}
                  onChange={(e) => updateCard(provider.id, { baseUrl: e.target.value })}
                  placeholder={provider.defaultUrl}
                  className="bg-white/[0.04]"
                />
              </div>
            </div>

            {card.testResult && (
              <div className={`flex items-center gap-2 text-xs ${card.testResult.ok ? "text-orbit-pass" : "text-orbit-fail"}`}>
                {card.testResult.ok ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Connected{card.testResult.latencyMs ? ` (${card.testResult.latencyMs}ms)` : ""}</span>
                  </>
                ) : (
                  <>
                    <X className="h-3.5 w-3.5" />
                    <span>{card.testResult.error}</span>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                type="button"
                onClick={() => handleSave(provider.id)}
                disabled={card.saving || (!data?.hasKey && !card.apiKey)}
                className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
              >
                {card.saving ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => handleTest(provider.id)}
                disabled={card.testing || !data?.hasKey}
              >
                {card.testing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...</>
                ) : (
                  <><Zap className="h-3.5 w-3.5" /> Test Connection</>
                )}
              </Button>
              {!data?.isDefault && data?.hasKey && (
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => handleSetDefault(provider.id)}
                  className="text-xs text-muted-foreground"
                >
                  Set as Default
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: "connected" | "disabled" | "not_configured" }) {
  const color =
    status === "connected" ? "bg-orbit-pass" :
    status === "disabled" ? "bg-muted-foreground" :
    "bg-muted-foreground/40";

  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
      <div className={`w-2 h-2 rounded-full ${color}`} />
    </div>
  );
}
