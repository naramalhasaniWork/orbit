"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ExternalLink, GitBranch, Copy, Check, RefreshCw, Loader2 } from "lucide-react";

interface GitHubConfig {
  connected: boolean;
  installationId?: string;
  repos?: string[];
}

interface Installation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  avatarUrl: string | null;
}

interface GitHubCardProps {
  workspaceId: string;
  config?: GitHubConfig;
  onUpdate: (config: Partial<GitHubConfig>) => void;
}

export function GitHubCard({ workspaceId, config, onUpdate }: GitHubCardProps) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [appConfigured, setAppConfigured] = useState(true);

  const connected = (config?.connected ?? false) || installations.length > 0;
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/github`;

  useEffect(() => {
    fetchInstallations();
  }, []);

  async function fetchInstallations() {
    try {
      const res = await fetch("/api/github/installations");
      if (res.ok) {
        const data = await res.json();
        setAppConfigured(data.configured);
        setInstallations(data.installations ?? []);
        if (data.installations?.length > 0 && !config?.connected) {
          onUpdate({
            connected: true,
            repos: data.installations.map((i: Installation) => i.accountLogin),
          });
        }
      }
    } catch { /* ignore */ }
  }

  function handleConnect() {
    setConnecting(true);
    window.location.href = `/api/github/install?return_to=${encodeURIComponent("/dashboard/settings")}`;
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/integrations/github`, {
        method: "DELETE",
      });
      if (res.ok) {
        setInstallations([]);
        onUpdate({ connected: false, installationId: undefined, repos: [] });
      }
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/github/installations", { method: "POST" });
      await fetchInstallations();
    } finally {
      setSyncing(false);
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
          <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
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

      {!appConfigured && !connected && (
        <div className="rounded-lg bg-orbit-flaky/10 border border-orbit-flaky/20 px-4 py-3">
          <p className="text-xs text-orbit-flaky">
            GitHub App is not configured on the server. Set <code className="font-mono">GITHUB_APP_ID</code>, <code className="font-mono">GITHUB_APP_PRIVATE_KEY</code>, and <code className="font-mono">GITHUB_APP_SLUG</code> env vars.
          </p>
        </div>
      )}

      {connected ? (
        <div className="space-y-4">
          {installations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Connected Organizations ({installations.length})
              </Label>
              <div className="space-y-1">
                {installations.map((inst) => (
                  <div
                    key={inst.id}
                    className="flex items-center gap-3 text-sm bg-muted/40 rounded-md px-3 py-2 border border-transparent"
                  >
                    {inst.avatarUrl && (
                      <img src={inst.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                    )}
                    <span className="font-mono text-foreground">{inst.accountLogin}</span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground ml-auto">
                      {inst.accountType}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Webhook URL</Label>
            <div className="flex gap-2">
              <div className="flex-1 text-sm font-mono bg-muted/40 rounded-md px-3 py-2 border border-transparent text-muted-foreground truncate">
                {webhookUrl}
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={copyWebhookUrl}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              GitHub automatically sends webhooks via the App. Use this URL only for manual webhook setup.
            </p>
          </div>

          <div className="pt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={handleConnect}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Add Organization
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect All"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={handleConnect}
          disabled={connecting || !appConfigured}
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {connecting ? "Connecting..." : "Connect GitHub"}
        </Button>
      )}
    </div>
  );
}
