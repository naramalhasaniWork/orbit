"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Zap,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================
// Types
// ============================================================

interface McpConnectionData {
  id: string;
  name: string;
  description: string | null;
  serverUrl: string;
  transportType: string;
  isActive: boolean;
  hasApiKey: boolean;
  toolsDiscovered: McpToolData[] | null;
  lastConnectedAt: string | null;
  createdAt: string;
}

interface McpToolData {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpConnectionsProps {
  workspaceId: string;
}

// ============================================================
// Component
// ============================================================

export function McpConnections({ workspaceId }: McpConnectionsProps) {
  const [connections, setConnections] = useState<McpConnectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/mcp-connections`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setConnections(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.id}
          connection={conn}
          workspaceId={workspaceId}
          onRefresh={fetchConnections}
        />
      ))}

      {connections.length === 0 && !showAddForm && (
        <div className="rounded-xl surface-1 p-8 text-center">
          <Plug className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No MCP connections configured. Connect an external MCP server to give
            Orbit&apos;s agents access to additional tools.
          </p>
        </div>
      )}

      {showAddForm ? (
        <AddConnectionForm
          workspaceId={workspaceId}
          onCancel={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            fetchConnections();
          }}
        />
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add MCP Connection
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Connection Card
// ============================================================

function ConnectionCard({
  connection,
  workspaceId,
  onRefresh,
}: {
  connection: McpConnectionData;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    toolCount?: number;
    error?: string;
  } | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const tools = connection.toolsDiscovered ?? [];
  const status = connection.isActive
    ? connection.lastConnectedAt
      ? "connected"
      : "pending"
    : "disabled";

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/mcp-connections/${connection.id}/test`,
        { method: "POST" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setTestResult({ ok: true, toolCount: json.data.toolCount });
        onRefresh();
      } else {
        setTestResult({ ok: false, error: json.error?.message ?? "Test failed" });
      }
    } catch {
      setTestResult({ ok: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  async function handleToggle(isActive: boolean) {
    setToggling(true);
    try {
      await fetch(
        `/api/workspaces/${workspaceId}/mcp-connections/${connection.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        }
      );
      onRefresh();
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete connection "${connection.name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(
        `/api/workspaces/${workspaceId}/mcp-connections/${connection.id}`,
        { method: "DELETE" }
      );
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">
                {connection.name}
              </h3>
              {tools.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {tools.length} tool{tools.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connection.serverUrl}
            </p>
            {connection.description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {connection.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`active-${connection.id}`}
            className="text-xs text-muted-foreground"
          >
            {connection.isActive ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id={`active-${connection.id}`}
            checked={connection.isActive}
            disabled={toggling}
            onCheckedChange={handleToggle}
          />
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 text-xs ${
            testResult.ok ? "text-orbit-pass" : "text-orbit-fail"
          }`}
        >
          {testResult.ok ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Connected — {testResult.toolCount} tools discovered</span>
            </>
          ) : (
            <>
              <X className="h-3.5 w-3.5" />
              <span>{testResult.error}</span>
            </>
          )}
        </div>
      )}

      {/* Tools list (expandable) */}
      {tools.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setToolsExpanded(!toolsExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {toolsExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Discovered tools ({tools.length})
          </button>
          {toolsExpanded && (
            <div className="mt-2 space-y-1.5 pl-5">
              {tools.map((tool) => (
                <div key={tool.name} className="text-xs">
                  <span className="font-mono text-foreground">{tool.name}</span>
                  <span className="text-muted-foreground ml-2">
                    {tool.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Testing...
            </>
          ) : (
            <>
              <Zap className="h-3.5 w-3.5 mr-1" /> Test Connection
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={deleting}
          className="text-orbit-fail hover:text-orbit-fail"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          {deleting ? "Deleting..." : "Delete"}
        </Button>
        {connection.lastConnectedAt && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            Last connected{" "}
            {new Date(connection.lastConnectedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Add Connection Form
// ============================================================

function AddConnectionForm({
  workspaceId,
  onCancel,
  onCreated,
}: {
  workspaceId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !serverUrl.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        serverUrl: serverUrl.trim(),
      };
      if (description.trim()) body.description = description.trim();
      if (apiKey) body.apiKey = apiKey;

      const res = await fetch(
        `/api/workspaces/${workspaceId}/mcp-connections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const json = await res.json();
      if (res.ok && json.success) {
        onCreated();
      } else {
        setError(json.error?.message ?? "Failed to create connection");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl surface-1 p-6 space-y-4">
      <h3 className="text-sm font-medium text-foreground">
        Add MCP Connection
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My MCP Server"
            className="bg-white/[0.04]"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Server URL</Label>
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://mcp-server.example.com/mcp"
            className="bg-white/[0.04]"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-xs text-muted-foreground">
            Description (optional)
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What tools does this server provide?"
            className="bg-white/[0.04]"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-xs text-muted-foreground">
            API Key (optional)
          </Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Bearer token for authentication"
              className="bg-white/[0.04] pr-9"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKey ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-orbit-fail">
          <X className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={saving || !name.trim() || !serverUrl.trim()}
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
        >
          {saving ? "Creating..." : "Create Connection"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ============================================================
// Status Dot
// ============================================================

function StatusDot({
  status,
}: {
  status: "connected" | "pending" | "disabled";
}) {
  const color =
    status === "connected"
      ? "bg-orbit-pass"
      : status === "pending"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";

  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
      <div className={`w-2 h-2 rounded-full ${color}`} />
    </div>
  );
}
