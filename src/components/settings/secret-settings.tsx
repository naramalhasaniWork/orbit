"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Eye, EyeOff, KeyRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Secret {
  id: string;
  key: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SecretSettingsProps {
  projectId: string | null;
  secrets: Secret[];
}

export function SecretSettings({ projectId, secrets: initial }: SecretSettingsProps) {
  const [secrets, setSecrets] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  if (!projectId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  async function handleAdd() {
    if (!newKey || !newValue) return;

    const res = await fetch(`/api/projects/${projectId}/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey, value: newValue }),
    });

    if (res.ok) {
      const secret = await res.json();
      setSecrets((prev) => [...prev, secret]);
      setNewKey("");
      setNewValue("");
      setShowValue(false);
      setShowAdd(false);
    }
  }

  async function handleDelete(secretId: string) {
    const res = await fetch(`/api/projects/${projectId}/secrets/${secretId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setSecrets((prev) => prev.filter((s) => s.id !== secretId));
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Key</Label>
              <Input
                placeholder="API_KEY"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                className="bg-white/[0.04] font-mono"
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
                  className="bg-white/[0.04] font-mono pr-9"
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
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} className="bg-orbit-accent hover:bg-orbit-accent/90 text-white">
              Encrypt & Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {secrets.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No secrets configured yet.</p>
          </div>
        ) : (
          secrets.map((secret) => (
            <div
              key={secret.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl surface-1"
            >
              <div className="flex items-center gap-3">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm font-mono font-medium text-foreground">{secret.key}</span>
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
                className="text-muted-foreground hover:text-red-400"
                onClick={() => handleDelete(secret.id)}
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
