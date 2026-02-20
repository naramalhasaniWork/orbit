"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  EyeOff,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Train,
} from "lucide-react";

interface RailwayProject {
  id: string;
  name: string;
  description: string | null;
}

interface RailwayConnectConfig {
  connected: boolean;
  userName?: string;
  railwayProjectId?: string;
  railwayProjectName?: string;
  serviceCount?: number;
}

interface RailwayConnectProps {
  workspaceId: string;
  projectId: string | null;
  config?: RailwayConnectConfig;
  onUpdate: (config: Partial<RailwayConnectConfig>) => void;
}

export function RailwayConnectCard({
  workspaceId,
  projectId,
  config,
  onUpdate,
}: RailwayConnectProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [projects, setProjects] = useState<RailwayProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    created: number;
    updated: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const connected = config?.connected ?? false;

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/railway`;

  async function handleConnect() {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/railway/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate({
          connected: true,
          userName: data.data?.userName,
        });
        setToken("");
        await loadProjects();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    const res = await fetch("/api/integrations/railway/connect", {
      method: "DELETE",
    });
    if (res.ok) {
      onUpdate({ connected: false, userName: undefined, railwayProjectId: undefined, railwayProjectName: undefined });
      setProjects([]);
    }
  }

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/integrations/railway/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.data?.projects ?? []);
      }
    } finally {
      setLoadingProjects(false);
    }
  }

  async function selectProject(railwayProjectId: string) {
    const res = await fetch("/api/integrations/railway/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ railwayProjectId }),
    });
    if (res.ok) {
      const data = await res.json();
      onUpdate({
        railwayProjectId: data.data?.project?.id,
        railwayProjectName: data.data?.project?.name,
        serviceCount: data.data?.services?.length ?? 0,
      });
    }
  }

  async function handleSyncEnvironments() {
    if (!projectId) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/integrations/railway/sync-environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSyncResult({
          created: data.data?.created ?? 0,
          updated: data.data?.updated ?? 0,
        });
      }
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
          <div className="h-9 w-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
            <Train className="h-4.5 w-4.5 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Railway</h3>
            <p className="text-xs text-muted-foreground">
              Deployment status, auto-discover environments, deploy triggers
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            connected
              ? "text-orbit-pass border-orbit-pass/30"
              : "text-muted-foreground"
          }
        >
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {connected ? (
        <ConnectedView
          config={config}
          projects={projects}
          loadingProjects={loadingProjects}
          syncing={syncing}
          syncResult={syncResult}
          webhookUrl={webhookUrl}
          copied={copied}
          projectId={projectId}
          onLoadProjects={loadProjects}
          onSelectProject={selectProject}
          onSync={handleSyncEnvironments}
          onCopy={copyWebhookUrl}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <DisconnectedView
          token={token}
          showToken={showToken}
          saving={saving}
          onTokenChange={setToken}
          onToggleShow={() => setShowToken(!showToken)}
          onConnect={handleConnect}
        />
      )}
    </div>
  );
}

function DisconnectedView({
  token,
  showToken,
  saving,
  onTokenChange,
  onToggleShow,
  onConnect,
}: {
  token: string;
  showToken: boolean;
  saving: boolean;
  onTokenChange: (v: string) => void;
  onToggleShow: () => void;
  onConnect: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">API Token</Label>
        <div className="relative max-w-md">
          <Input
            type={showToken ? "text" : "password"}
            placeholder="Railway API token..."
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            className="bg-white/[0.04] font-mono pr-9"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showToken ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Create a token at{" "}
          <a
            href="https://railway.com/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orbit-accent hover:underline"
          >
            railway.com/account/tokens
          </a>
        </p>
      </div>
      <Button
        size="sm"
        onClick={onConnect}
        disabled={saving || !token.trim()}
        className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-1.5"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {saving ? "Connecting..." : "Connect Railway"}
      </Button>
    </div>
  );
}

function ConnectedView({
  config,
  projects,
  loadingProjects,
  syncing,
  syncResult,
  webhookUrl,
  copied,
  projectId,
  onLoadProjects,
  onSelectProject,
  onSync,
  onCopy,
  onDisconnect,
}: {
  config?: RailwayConnectConfig;
  projects: RailwayProject[];
  loadingProjects: boolean;
  syncing: boolean;
  syncResult: { created: number; updated: number } | null;
  webhookUrl: string;
  copied: boolean;
  projectId: string | null;
  onLoadProjects: () => void;
  onSelectProject: (id: string) => void;
  onSync: () => void;
  onCopy: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="space-y-4">
      {config?.userName && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Connected as
          </Label>
          <div className="text-sm bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-foreground">
            {config.userName}
          </div>
        </div>
      )}

      {config?.railwayProjectName ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Railway Project
          </Label>
          <div className="text-sm bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-foreground flex items-center justify-between">
            <span>{config.railwayProjectName}</span>
            {config.serviceCount !== undefined && (
              <span className="text-xs text-muted-foreground">
                {config.serviceCount} service
                {config.serviceCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Select Railway Project
          </Label>
          {projects.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className="w-full text-left text-sm bg-white/[0.04] hover:bg-white/[0.08] rounded-md px-3 py-2 border border-transparent text-foreground transition-colors"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.description && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {p.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onLoadProjects}
              disabled={loadingProjects}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingProjects ? "animate-spin" : ""}`}
              />
              {loadingProjects ? "Loading..." : "Load Projects"}
            </Button>
          )}
        </div>
      )}

      {config?.railwayProjectName && projectId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onSync}
              disabled={syncing}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing..." : "Sync Environments"}
            </Button>
          </div>
          {syncResult && (
            <p className="text-xs text-muted-foreground">
              {syncResult.created} created, {syncResult.updated} updated
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Webhook URL</Label>
        <div className="flex gap-2">
          <div className="flex-1 text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-muted-foreground truncate">
            {webhookUrl}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={onCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className="pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
