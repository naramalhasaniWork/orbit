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
  bugDiscovered: boolean;
  planUpdated: boolean;
}

interface SlackConfig {
  connected: boolean;
  teamName?: string;
  defaultChannel?: string;
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
  { key: "bugDiscovered", label: "Bug discovered", description: "Notify when a new bug is found" },
  { key: "planUpdated", label: "Plan updated", description: "Notify when test plan changes" },
];

export function SlackCard({ workspaceId, config, onUpdate }: SlackCardProps) {
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [channel, setChannel] = useState(config?.defaultChannel ?? "");
  const [saving, setSaving] = useState(false);
  const connected = config?.connected ?? false;

  async function handleConnect() {
    if (!botToken.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/integrations/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken, defaultChannel: channel || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate({
          connected: true,
          teamName: data.teamName,
          defaultChannel: channel || undefined,
          notifications: {
            runCompleted: true,
            testFailed: true,
            bugDiscovered: true,
            planUpdated: false,
          },
        });
        setBotToken("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    const res = await fetch(`/api/workspaces/${workspaceId}/integrations/slack`, {
      method: "DELETE",
    });
    if (res.ok) {
      onUpdate({ connected: false, teamName: undefined, defaultChannel: undefined, notifications: undefined });
    }
  }

  async function handleToggleNotification(key: keyof SlackNotifications, checked: boolean) {
    const updated = { ...config?.notifications, [key]: checked } as SlackNotifications;
    onUpdate({ notifications: updated });
    await fetch(`/api/workspaces/${workspaceId}/integrations/slack`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifications: updated }),
    });
  }

  async function handleUpdateChannel() {
    onUpdate({ defaultChannel: channel });
    await fetch(`/api/workspaces/${workspaceId}/integrations/slack`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultChannel: channel }),
    });
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
            <Hash className="h-4.5 w-4.5 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Slack</h3>
            <p className="text-xs text-muted-foreground">
              Notifications, slash commands, and interactive messages
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
              <Label className="text-xs text-muted-foreground">Connected Workspace</Label>
              <div className="text-sm bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-foreground">
                {config.teamName}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Default Channel</Label>
            <div className="flex gap-2 max-w-md">
              <Input
                placeholder="#orbit-testing"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="bg-white/[0.04]"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={channel === (config?.defaultChannel ?? "")}
                onClick={handleUpdateChannel}
              >
                Save
              </Button>
            </div>
          </div>

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
            <Label className="text-xs text-muted-foreground">Bot Token</Label>
            <div className="relative max-w-md">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="xoxb-..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="bg-white/[0.04] font-mono pr-9"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Default Channel (optional)</Label>
            <Input
              placeholder="#orbit-testing"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="bg-white/[0.04] max-w-md"
            />
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={saving || !botToken.trim()}
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {saving ? "Connecting..." : "Connect Slack"}
          </Button>
        </div>
      )}
    </div>
  );
}
