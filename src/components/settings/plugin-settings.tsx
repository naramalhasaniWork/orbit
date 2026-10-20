"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Puzzle,
  Download,
  Trash2,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  hooks: string[];
  installed: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: string | null;
}

interface PluginSettingsProps {
  workspaceId: string | null;
}

// ============================================================
// Component
// ============================================================

export function PluginSettings({ workspaceId }: PluginSettingsProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/plugins`);
      if (res.ok) {
        const json = await res.json();
        setPlugins(json.data?.plugins ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  if (!workspaceId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No workspace found.</p>
      </div>
    );
  }

  async function handleInstall(pluginName: string) {
    setActionLoading(pluginName);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginName }),
      });
      if (res.ok) await fetchPlugins();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUninstall(pluginName: string) {
    setActionLoading(pluginName);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/plugins/${pluginName}`,
        { method: "DELETE" }
      );
      if (res.ok) await fetchPlugins();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggle(pluginName: string, enabled: boolean) {
    setActionLoading(pluginName);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/plugins/${pluginName}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        }
      );
      if (res.ok) await fetchPlugins();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConfigSave(
    pluginName: string,
    config: Record<string, unknown>
  ) {
    setActionLoading(pluginName);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/plugins/${pluginName}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        }
      );
      if (res.ok) await fetchPlugins();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          Plugins extend Orbit with custom hooks for notifications, CI
          integrations, and automated reporting.
        </p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <LoadingSkeleton />
        ) : plugins.length === 0 ? (
          <EmptyState />
        ) : (
          plugins.map((plugin) => (
            <PluginCard
              key={plugin.name}
              plugin={plugin}
              isExpanded={expandedPlugin === plugin.name}
              isLoading={actionLoading === plugin.name}
              onToggleExpand={() =>
                setExpandedPlugin(
                  expandedPlugin === plugin.name ? null : plugin.name
                )
              }
              onInstall={() => handleInstall(plugin.name)}
              onUninstall={() => handleUninstall(plugin.name)}
              onToggle={(enabled) => handleToggle(plugin.name, enabled)}
              onConfigSave={(config) =>
                handleConfigSave(plugin.name, config)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl surface-1 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-foreground/[0.06] rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-foreground/[0.06] rounded" />
              <div className="h-3 w-48 bg-foreground/[0.04] rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl surface-1 p-8 text-center">
      <Puzzle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        No plugins available.
      </p>
    </div>
  );
}

interface PluginCardProps {
  plugin: PluginInfo;
  isExpanded: boolean;
  isLoading: boolean;
  onToggleExpand: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggle: (enabled: boolean) => void;
  onConfigSave: (config: Record<string, unknown>) => void;
}

function PluginCard({
  plugin,
  isExpanded,
  isLoading,
  onToggleExpand,
  onInstall,
  onUninstall,
  onToggle,
  onConfigSave,
}: PluginCardProps) {
  return (
    <div className="rounded-xl surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04] shrink-0">
            <Puzzle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {plugin.name}
              </span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                v{plugin.version}
              </Badge>
              {plugin.installed && (
                <Badge
                  variant="outline"
                  className={
                    plugin.enabled
                      ? "text-[10px] border-emerald-500/30 text-emerald-400 shrink-0"
                      : "text-[10px] border-zinc-500/30 text-zinc-400 shrink-0"
                  }
                >
                  {plugin.enabled ? "Active" : "Disabled"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {plugin.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLoading && (
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
          {plugin.installed ? (
            <>
              <Switch
                checked={plugin.enabled}
                onCheckedChange={onToggle}
                disabled={isLoading}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={onToggleExpand}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={onInstall}
              disabled={isLoading}
            >
              <Download className="h-3 w-3" />
              Install
            </Button>
          )}
        </div>
      </div>

      {isExpanded && plugin.installed && (
        <PluginConfigPanel
          plugin={plugin}
          isLoading={isLoading}
          onConfigSave={onConfigSave}
          onUninstall={onUninstall}
        />
      )}
    </div>
  );
}

interface PluginConfigPanelProps {
  plugin: PluginInfo;
  isLoading: boolean;
  onConfigSave: (config: Record<string, unknown>) => void;
  onUninstall: () => void;
}

function PluginConfigPanel({
  plugin,
  isLoading,
  onConfigSave,
  onUninstall,
}: PluginConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(
    plugin.config
  );

  function handleFieldChange(key: string, value: string) {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  }

  const configKeys = Object.keys(localConfig);
  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(plugin.config);

  return (
    <div className="border-t border-border px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Settings className="h-3 w-3" />
        <span>Configuration</span>
      </div>

      {configKeys.length > 0 ? (
        <div className="space-y-2">
          {configKeys.map((key) => (
            <div key={key} className="space-y-1 max-w-md">
              <Label className="text-xs text-muted-foreground capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </Label>
              <Input
                value={String(localConfig[key] ?? "")}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="bg-foreground/[0.04] text-sm h-8"
                placeholder={`Enter ${key}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No configuration options for this plugin.
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <span>Hooks:</span>
        {plugin.hooks.map((hook) => (
          <Badge key={hook} variant="outline" className="text-[10px]">
            {hook}
          </Badge>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button
          size="sm"
          variant="ghost"
          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 gap-1.5 text-xs"
          onClick={onUninstall}
          disabled={isLoading}
        >
          <Trash2 className="h-3 w-3" />
          Uninstall
        </Button>
        {hasChanges && (
          <Button
            size="sm"
            onClick={() => onConfigSave(localConfig)}
            disabled={isLoading}
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white text-xs"
          >
            Save Config
          </Button>
        )}
      </div>
    </div>
  );
}
