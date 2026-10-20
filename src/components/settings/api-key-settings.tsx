"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, Check, Key, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiErrorMessage } from "@/lib/api-client";
import { InlineError } from "@/components/shared/inline-error";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiKeySettingsProps {
  workspaceId: string | null;
}

export function ApiKeySettings({ workspaceId }: ApiKeySettingsProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    async function fetchKeys() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`);
        if (res.ok) {
          const json = await res.json();
          setKeys(json.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchKeys();
  }, [workspaceId]);

  if (!workspaceId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No workspace found.</p>
      </div>
    );
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (!res.ok) {
        setActionError(await apiErrorMessage(res, "Couldn't create the API key"));
        return;
      }
      const json = await res.json();
      setNewKeyValue(json.data.key);
      setKeys((prev) => [json.data.apiKey, ...prev]);
      setNewKeyName("");
    } catch {
      setActionError("Couldn't create the API key. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setActionError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/api-keys/${keyId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      setActionError(res ? await apiErrorMessage(res, "Couldn't revoke the key") : "Couldn't revoke the key. Check your connection.");
      return;
    }
    setKeys((prev) => prev.filter((k) => k.id !== keyId));
  }

  function copyKey() {
    if (!newKeyValue) return;
    navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function dismissNewKey() {
    setNewKeyValue(null);
    setShowCreate(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            API keys authenticate requests to the Orbit public API and MCP server.
            Keys are hashed and cannot be retrieved after creation.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            setShowCreate(!showCreate);
            setNewKeyValue(null);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create Key
        </Button>
      </div>

      <InlineError message={actionError} />

      {newKeyValue && (
        <div className="rounded-xl border border-orbit-accent/30 bg-orbit-accent/5 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            API key created -- copy it now, it won&apos;t be shown again.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 text-sm font-mono bg-muted/40 rounded-md px-3 py-2 border border-transparent text-foreground break-all">
              {newKeyValue}
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={copyKey}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={dismissNewKey}>
            Done
          </Button>
        </div>
      )}

      {showCreate && !newKeyValue && (
        <div className="rounded-xl surface-1 p-4 space-y-3">
          <div className="space-y-1.5 max-w-md">
            <Label className="text-xs text-muted-foreground">Key Name</Label>
            <Input
              placeholder="CI/CD Pipeline"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="bg-muted/40"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
            >
              {creating ? "Creating..." : "Generate Key"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="rounded-xl surface-1 p-8 text-center animate-pulse">
            <div className="h-4 w-32 bg-muted/50 rounded mx-auto" />
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <Key className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No API keys created yet.</p>
          </div>
        ) : (
          keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl surface-1"
            >
              <div className="flex items-center gap-3">
                <Key className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{key.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {key.prefix}...
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>
                      Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                    </span>
                    {key.lastUsedAt && (
                      <span>
                        Last used {formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-red-400"
                onClick={() => handleRevoke(key.id)}
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
