"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Webhook, Copy, Check, Eye, EyeOff } from "lucide-react";

interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isEnabled: boolean;
}

interface WebhookSettingsProps {
  projectId: string | null;
}

const EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: "run.started", label: "Run started" },
  { value: "run.completed", label: "Run completed" },
  { value: "run.failed", label: "Run failed" },
  { value: "test.failed", label: "Test failed" },
  { value: "test.flaky", label: "Test flaky" },
  { value: "bug.discovered", label: "Bug discovered" },
  { value: "plan.updated", label: "Plan updated" },
];

export function WebhookSettings({ projectId }: WebhookSettingsProps) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({ url: "", events: ["run.completed", "test.failed"] });
  const [creating, setCreating] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    async function fetchEndpoints() {
      try {
        const res = await fetch(`/api/projects/${projectId}/webhooks`);
        if (res.ok) {
          const json = await res.json();
          setEndpoints(json.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchEndpoints();
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  async function handleCreate() {
    if (!newEndpoint.url.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEndpoint),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedSecret(data.secret);
        setEndpoints((prev) => [...prev, data.endpoint]);
        setNewEndpoint({ url: "", events: ["run.completed", "test.failed"] });
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(endpointId: string) {
    const res = await fetch(`/api/projects/${projectId}/webhooks/${endpointId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setEndpoints((prev) => prev.filter((e) => e.id !== endpointId));
    }
  }

  async function handleToggle(endpointId: string, isEnabled: boolean) {
    setEndpoints((prev) =>
      prev.map((e) => (e.id === endpointId ? { ...e, isEnabled } : e))
    );
    await fetch(`/api/projects/${projectId}/webhooks/${endpointId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled }),
    });
  }

  function toggleEvent(event: string) {
    setNewEndpoint((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  }

  function copySecret() {
    if (!generatedSecret) return;
    navigator.clipboard.writeText(generatedSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Receive real-time HTTP callbacks when events occur in your project.
            Payloads are signed with HMAC-SHA256.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            setShowAdd(!showAdd);
            setGeneratedSecret(null);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Endpoint
        </Button>
      </div>

      {generatedSecret && (
        <div className="rounded-xl border border-orbit-accent/30 bg-orbit-accent/5 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Webhook signing secret -- copy it now, it won&apos;t be shown again.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-foreground break-all">
              {generatedSecret}
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={copySecret}>
              {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setGeneratedSecret(null)}>
            Done
          </Button>
        </div>
      )}

      {showAdd && !generatedSecret && (
        <div className="rounded-xl surface-1 p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
            <Input
              placeholder="https://example.com/webhooks/orbit"
              value={newEndpoint.url}
              onChange={(e) => setNewEndpoint({ ...newEndpoint, url: e.target.value })}
              className="bg-white/[0.04]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Events</Label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleEvent(opt.value)}
                  className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                    newEndpoint.events.includes(opt.value)
                      ? "bg-orbit-accent/15 text-orbit-accent"
                      : "bg-white/[0.04] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newEndpoint.url.trim() || newEndpoint.events.length === 0}
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
            >
              {creating ? "Creating..." : "Create Endpoint"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="rounded-xl surface-1 p-8 text-center animate-pulse">
            <div className="h-4 w-32 bg-white/[0.06] rounded mx-auto" />
          </div>
        ) : endpoints.length === 0 ? (
          <div className="rounded-xl surface-1 p-8 text-center">
            <Webhook className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No webhook endpoints configured.</p>
          </div>
        ) : (
          endpoints.map((ep) => (
            <div
              key={ep.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl surface-1"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={ep.isEnabled}
                  onCheckedChange={(checked) => handleToggle(ep.id, checked)}
                  className="scale-75"
                />
                <div>
                  <span className="text-sm font-mono text-foreground truncate block max-w-sm">
                    {ep.url}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ep.events.map((event) => (
                      <Badge key={event} variant="outline" className="text-[10px]">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-red-400"
                onClick={() => handleDelete(ep.id)}
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
