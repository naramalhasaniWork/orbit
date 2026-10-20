"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, ExternalLink, Hash } from "lucide-react";

interface SlackNotifications {
  runCompleted: boolean;
  testFailed: boolean;
}

interface SlackConfig {
  connected: boolean;
  notifications?: SlackNotifications;
}

interface SlackCardProps {
  workspaceId: string;
  config?: SlackConfig;
  onUpdate: (config: Partial<SlackConfig>) => void;
}

const NOTIFICATION_OPTIONS: { key: keyof SlackNotifications; label: string; description: string }[] = [
  { key: "runCompleted", label: "Run completed", description: "Notify when a test run finishes" },
  { key: "testFailed", label: "Test failed", description: "Notify on individual test failures" },
];

export function SlackCard({ workspaceId, config, onUpdate }: SlackCardProps) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = config?.connected ?? false;
  const endpoint = `/api/workspaces/${workspaceId}/integrations/slack`;

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
    if (!webhookUrl.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data = await send("POST", { webhookUrl });
      onUpdate({ connected: true, notifications: data.notifications });
      setWebhookUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Slack");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      await send("DELETE");
      onUpdate({ connected: false, notifications: undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Slack");
    }
  }

  async function handleToggleNotification(key: keyof SlackNotifications, checked: boolean) {
    const previous = config?.notifications;
    const updated = { ...previous, [key]: checked } as SlackNotifications;
    onUpdate({ notifications: updated });
    setError(null);
    try {
      await send("PATCH", { notifications: updated });
    } catch (err) {
      onUpdate({ notifications: previous });
      setError(err instanceof Error ? err.message : "Failed to save preferences");
    }
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
            <Hash className="h-4.5 w-4.5 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Slack</h3>
            <p className="text-xs text-muted-foreground">
              Post run results and failure alerts to a channel
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
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Notification Preferences</Label>
            {NOTIFICATION_OPTIONS.map((opt) => (
              <div key={opt.key} className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-foreground">{opt.label}</span>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                <Switch
                  checked={config?.notifications?.[opt.key] ?? false}
                  onCheckedChange={(checked) => handleToggleNotification(opt.key, checked)}
                />
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Incoming Webhook URL</Label>
            <div className="relative max-w-md">
              <Input
                type={showUrl ? "text" : "password"}
                placeholder="https://hooks.slack.com/services/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="bg-muted/40 font-mono pr-9"
              />
              <button
                type="button"
                onClick={() => setShowUrl(!showUrl)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showUrl ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create one in Slack under Apps, Incoming Webhooks. Messages post to the channel you pick there.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={saving || !webhookUrl.trim()}
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {saving ? "Connecting..." : "Connect Slack"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
