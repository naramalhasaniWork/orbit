"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ExternalLink, GitBranch, Copy, Check } from "lucide-react";

interface GitHubConfig {
  connected: boolean;
  installationId?: string;
  repos?: string[];
}

interface GitHubCardProps {
  workspaceId: string;
  config?: GitHubConfig;
  onUpdate: (config: Partial<GitHubConfig>) => void;
}

export function GitHubCard({ workspaceId, config, onUpdate }: GitHubCardProps) {
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const connected = config?.connected ?? false;
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/github`;

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/integrations/github`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    const res = await fetch(`/api/workspaces/${workspaceId}/integrations/github`, {
      method: "DELETE",
    });
    if (res.ok) {
      onUpdate({ connected: false, installationId: undefined, repos: [] });
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
            <GitBranch className="h-4.5 w-4.5 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">GitHub</h3>
            <p className="text-xs text-muted-foreground">
              PR comments, check runs, and diff-aware testing
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
          {config?.installationId && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Installation ID</Label>
              <div className="text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-foreground">
                {config.installationId}
              </div>
            </div>
          )}

          {config?.repos && config.repos.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Connected Repositories ({config.repos.length})
              </Label>
              <div className="space-y-1">
                {config.repos.map((repo) => (
                  <div
                    key={repo}
                    className="text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-foreground"
                  >
                    {repo}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Webhook URL</Label>
            <div className="flex gap-2">
              <div className="flex-1 text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-muted-foreground truncate">
                {webhookUrl}
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={copyWebhookUrl}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={handleConnect}
          disabled={connecting}
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {connecting ? "Connecting..." : "Connect GitHub"}
        </Button>
      )}
    </div>
  );
}
