"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, EyeOff, KeyRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Secret {
  id: string;
  key: string;
  environmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Environment {
  id: string;
  name: string;
  type: string;
}

interface SecretSettingsProps {
  projectId: string | null;
  secrets: Secret[];
  environments: Environment[];
}

export function SecretSettings({ projectId, secrets: initial, environments }: SecretSettingsProps) {
  const [secrets, setSecrets] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newEnvId, setNewEnvId] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterEnvId, setFilterEnvId] = useState<string>("all");

  if (!projectId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  const envMap = new Map(environments.map((e) => [e.id, e]));

  function getEnvLabel(environmentId: string | null) {
    if (!environmentId) return null;
    return envMap.get(environmentId)?.name ?? "Unknown";
  }

  const filtered = filterEnvId === "all"
    ? secrets
    : filterEnvId === "global"
      ? secrets.filter((s) => !s.environmentId)
      : secrets.filter((s) => s.environmentId === filterEnvId);

  async function handleAdd() {
    if (!newKey || !newValue || adding) return;
    setAdding(true);
    try {
      const payload: Record<string, string> = { key: newKey, value: newValue };
      if (newEnvId) payload.environmentId = newEnvId;

      const res = await fetch(`/api/projects/${projectId}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const { data: secret } = await res.json();
        setSecrets((prev) => {
          const idx = prev.findIndex((s) => s.id === secret.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = secret;
            return next;
          }
          return [...prev, secret];
        });
        setNewKey("");
        setNewValue("");
        setNewEnvId("");
        setShowValue(false);
        setShowAdd(false);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(secretId: string) {
    if (deletingId) return;
    setDeletingId(secretId);
    try {
      const res = await fetch(`/api/projects/${projectId}/secrets/${secretId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSecrets((prev) => prev.filter((s) => s.id !== secretId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Secrets are encrypted at rest with AES-256-GCM. They are injected into test execution as environment variables.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Secret
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-xl surface-1 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Key</Label>
              <Input
                placeholder="TEST_EMAIL"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                className="bg-muted/40 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Value</Label>
              <div className="relative">
                <Input
                  type={showValue ? "text" : "password"}
                  placeholder="secret value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="bg-muted/40 font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Environment</Label>
              <select
                value={newEnvId}
                onChange={(e) => setNewEnvId(e.target.value)}
                className="w-full h-9 rounded-md border border-transparent bg-muted/40 px-3 text-sm focus:border-orbit-accent/30 focus:outline-none"
              >
                <option value="">All environments (global)</option>
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} ({env.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Default credentials: <code className="text-foreground/70">TEST_EMAIL</code>, <code className="text-foreground/70">TEST_PASSWORD</code>.
            For role-specific auth, prefix with the role: <code className="text-foreground/70">ADMIN_EMAIL</code>, <code className="text-foreground/70">ADMIN_PASSWORD</code>, <code className="text-foreground/70">USER_EMAIL</code>, etc.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={adding || !newKey || !newValue} className="bg-orbit-accent hover:bg-orbit-accent/90 text-white">
              {adding ? "Saving..." : "Encrypt & Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} disabled={adding}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {environments.length > 0 && secrets.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground mr-1">Filter:</span>
          <button
            type="button"
            onClick={() => setFilterEnvId("all")}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              filterEnvId === "all"
                ? "bg-foreground/[0.08] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterEnvId("global")}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              filterEnvId === "global"
                ? "bg-foreground/[0.08] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
          >
            Global
          </button>
          {environments.map((env) => (
            <button
              key={env.id}
              type="button"
              onClick={() => setFilterEnvId(env.id)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                filterEnvId === env.id
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              {env.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {secrets.length === 0 ? "No secrets configured yet." : "No secrets match this filter."}
            </p>
          </div>
        ) : (
          filtered.map((secret) => (
            <div
              key={secret.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl surface-1"
            >
              <div className="flex items-center gap-3">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-foreground">{secret.key}</span>
                    {secret.environmentId ? (
                      <Badge variant="outline" className="text-[10px] text-orbit-accent">
                        {getEnvLabel(secret.environmentId)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        global
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">{"••••••••"}</span>
                    <span className="text-xs text-muted-foreground">
                      updated {formatDistanceToNow(new Date(secret.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(secret.id)}
                disabled={deletingId === secret.id}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
