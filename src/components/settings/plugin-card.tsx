"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState } from "react";
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
  } from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  hooks: string[];
  installed: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: string | null;
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

// ============================================================
// Plugin Card
// ============================================================

export function PluginCard({
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
                      ? "text-[10px] border-tm-pass/30 text-tm-pass shrink-0"
                      : "text-[10px] border-tm-t3/30 text-tm-t3 shrink-0"
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
            <Pending />
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

// ============================================================
// Config Panel
// ============================================================

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
  const hasChanges =
    JSON.stringify(localConfig) !== JSON.stringify(plugin.config);

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
          className="text-tm-fail hover:text-tm-fail hover:bg-tm-fail/10 gap-1.5 text-xs"
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
            className="bg-primary hover:bg-primary/85 text-primary-foreground text-xs"
          >
            Save Config
          </Button>
        )}
      </div>
    </div>
  );
}
