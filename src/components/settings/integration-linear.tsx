"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { LinearInbound } from "@/components/settings/linear-inbound";

export interface LinearConfig {
  connected: boolean;
  teamId?: string;
  teamName?: string;
  autoCreateIssues?: boolean;
  hasInboundUrl?: boolean;
  inboundProjectId?: string | null;
  projects?: Array<{ id: string; name: string }>;
}

interface LinearCardProps {
  workspaceId: string;
  config?: LinearConfig;
  onUpdate: (config: Partial<LinearConfig>) => void;
}

export function LinearCard({ workspaceId, config, onUpdate }: LinearCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = config?.connected ?? false;
  const endpoint = `/api/workspaces/${workspaceId}/integrations/linear`;

  async function send(method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message ?? "Request failed");
    }
    return json?.data;
  }

  async function handleConnect() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data = await send("POST", { apiKey });
      onUpdate({
        connected: true,
        teamId: data.teamId,
        teamName: data.teamName,
        autoCreateIssues: data.autoCreateIssues,
      });
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Linear");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      await send("DELETE");
      onUpdate({ connected: false, teamId: undefined, teamName: undefined, autoCreateIssues: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Linear");
    }
  }

  async function handleToggleAutoCreate(checked: boolean) {
    const previous = config?.autoCreateIssues ?? false;
    onUpdate({ autoCreateIssues: checked });
    setError(null);
    try {
      await send("PATCH", { autoCreateIssues: checked });
    } catch (err) {
      onUpdate({ autoCreateIssues: previous });
      setError(err instanceof Error ? err.message : "Failed to save setting");
    }
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
            <svg className="h-4 w-4 text-foreground" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zm0 2a8 8 0 110 16 8 8 0 010-16zm0 2a6 6 0 100 12 6 6 0 000-12z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Linear</h3>
            <p className="text-xs text-muted-foreground">
              Auto-create bug issues and sync test results
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={connected ? "text-orbit-pass border-orbit-pass/30" : "text-muted-foreground"}
        >
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {connected ? (
        <div className="space-y-4">
          {config?.teamName && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Connected Team</Label>
              <div className="text-sm bg-muted/40 rounded-md px-3 py-2 border border-transparent text-foreground">
                {config.teamName}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-foreground">Auto-create issues</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically create Linear issues for discovered bugs
              </p>
            </div>
            <Switch
              checked={config?.autoCreateIssues ?? false}
              onCheckedChange={handleToggleAutoCreate}
            />
          </div>

          <LinearInbound
            workspaceId={workspaceId}
            hasInboundUrl={config?.hasInboundUrl ?? false}
            inboundProjectId={config?.inboundProjectId ?? null}
            projects={config?.projects ?? []}
            onChange={onUpdate}
          />

          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <div className="relative max-w-md">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="lin_api_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-muted/40 font-mono pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={saving || !apiKey.trim()}
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {saving ? "Connecting..." : "Connect Linear"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
