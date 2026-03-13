"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Globe, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Environment {
  id: string;
  name: string;
  type: string;
  url: string;
  isDefault: boolean;
  defaultRunMode: string;
}

interface EnvironmentSettingsProps {
  projectId: string | null;
  environments: Environment[];
}

const typeColors: Record<string, string> = {
  staging: "text-orbit-flaky",
  production: "text-orbit-fail",
  development: "text-orbit-pass",
  preview: "text-orbit-accent",
};

export function EnvironmentSettings({ projectId, environments: initial }: EnvironmentSettingsProps) {
  const [environments, setEnvironments] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [newEnv, setNewEnv] = useState({ name: "", type: "staging", url: "", defaultRunMode: "full" });
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!projectId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  async function handleAdd() {
    if (!newEnv.name || !newEnv.url || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEnv),
      });

      if (res.ok) {
        const { data: env } = await res.json();
        setEnvironments((prev) => [...prev, env]);
        setNewEnv({ name: "", type: "staging", url: "", defaultRunMode: "full" });
        setShowAdd(false);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(envId: string) {
    if (deletingId) return;
    setDeletingId(envId);
    try {
      const res = await fetch(`/api/projects/${projectId}/environments/${envId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setEnvironments((prev) => prev.filter((e) => e.id !== envId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSetDefault(envId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: envId, isDefault: true }),
      });
      if (res.ok) {
        setEnvironments((prev) =>
          prev.map((e) => ({ ...e, isDefault: e.id === envId }))
        );
      }
    } catch { /* no-op */ }
  }

  async function handleRunModeChange(envId: string, mode: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: envId, defaultRunMode: mode }),
      });
      if (res.ok) {
        setEnvironments((prev) =>
          prev.map((e) => (e.id === envId ? { ...e, defaultRunMode: mode } : e))
        );
      }
    } catch { /* no-op */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Configure target environments for test execution.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Environment
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-xl surface-1 p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                placeholder="Staging"
                value={newEnv.name}
                onChange={(e) => setNewEnv({ ...newEnv, name: e.target.value })}
                className="bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <select
                value={newEnv.type}
                onChange={(e) => setNewEnv({ ...newEnv, type: e.target.value })}
                className="w-full h-9 rounded-md border border-transparent bg-muted/40 px-3 text-sm focus:border-orbit-accent/30 focus:outline-none"
              >
                <option value="staging">Staging</option>
                <option value="preview">Preview</option>
                <option value="development">Development</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Base URL</Label>
              <Input
                placeholder="https://staging.example.com"
                value={newEnv.url}
                onChange={(e) => setNewEnv({ ...newEnv, url: e.target.value })}
                className="bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default Run Mode</Label>
              <select
                value={newEnv.defaultRunMode}
                onChange={(e) => setNewEnv({ ...newEnv, defaultRunMode: e.target.value })}
                className="w-full h-9 rounded-md border border-transparent bg-muted/40 px-3 text-sm focus:border-orbit-accent/30 focus:outline-none"
              >
                <option value="full">Full Suite</option>
                <option value="smoke">Smoke (Critical Path)</option>
                <option value="regression">Regression</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={adding || !newEnv.name || !newEnv.url} className="bg-orbit-accent hover:bg-orbit-accent/90 text-white">
              {adding ? "Adding..." : "Add"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} disabled={adding}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {environments.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No environments configured yet.</p>
          </div>
        ) : (
          environments.map((env) => (
            <div
              key={env.id}
              className="rounded-xl surface-1 px-4 py-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("h-2 w-2 rounded-full", env.isDefault ? "bg-orbit-accent" : "bg-muted")} />
                  <span className="text-sm font-medium text-foreground">{env.name}</span>
                  <Badge variant="outline" className={cn("text-[10px]", typeColors[env.type])}>
                    {env.type}
                  </Badge>
                  {env.isDefault && (
                    <Badge variant="outline" className="text-[10px] text-orbit-accent">
                      default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!env.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-orbit-accent gap-1 text-xs"
                      onClick={() => handleSetDefault(env.id)}
                    >
                      <Star className="h-3 w-3" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-400"
                    onClick={() => handleDelete(env.id)}
                    disabled={deletingId === env.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[60%]">
                  {env.url}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Run mode:</span>
                  <select
                    value={env.defaultRunMode ?? "full"}
                    onChange={(e) => handleRunModeChange(env.id, e.target.value)}
                    className="h-7 rounded-md border border-transparent bg-muted/40 px-2 text-xs focus:border-orbit-accent/30 focus:outline-none"
                  >
                    <option value="full">Full Suite</option>
                    <option value="smoke">Smoke</option>
                    <option value="regression">Regression</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
