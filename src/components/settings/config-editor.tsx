"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, FileCode2, Copy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrbitConfig {
  scope: {
    include: string[];
    exclude: string[];
    critical: string[];
  };
  coverage: {
    target: number;
    criticalTarget: number;
  };
  execution: {
    mode: string;
    flakinessTolerance: number;
    maxParallelBrowsers: number;
    maxRunDurationMs: number;
    failureThreshold: number;
  };
}

interface ConfigError {
  field: string;
  message: string;
}

interface ConfigEditorProps {
  projectId: string | null;
}

export function ConfigEditor({ projectId }: ConfigEditorProps) {
  const [config, setConfig] = useState<OrbitConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ConfigError[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const json = await res.json();
      setConfig(json.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (!projectId) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.errors?.length > 0) {
          setErrors(json.data.errors);
        }
        if (json.data?.config) {
          setConfig(json.data.config);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleGetTemplate() {
    const res = await fetch(`/api/projects/${projectId}/config?template=true`);
    if (res.ok) {
      const json = await res.json();
      setTemplate(json.data?.template ?? null);
    }
  }

  async function handleCopyTemplate() {
    if (template) {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl surface-1 p-8 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <AlertTriangle className="h-5 w-5 text-orbit-fail mx-auto mb-2" />
        <p className="text-sm text-foreground">Couldn&apos;t load configuration.</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          Something went wrong fetching this project&apos;s config.
        </p>
        <Button variant="outline" size="sm" onClick={fetchConfig}>
          Retry
        </Button>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Project Configuration
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure test scope, coverage targets, and execution settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleGetTemplate}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            orbit.config.ts
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg bg-orbit-fail/10 border border-orbit-fail/20 p-3 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-orbit-fail">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="font-mono">{e.field}</span>: {e.message}
            </div>
          ))}
        </div>
      )}

      {template && (
        <div className="rounded-xl surface-1 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              orbit.config.ts template
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={handleCopyTemplate}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="text-[11px] font-mono text-foreground/80 bg-black/20 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
            {template}
          </pre>
        </div>
      )}

      {/* Scope Config */}
      <div className="rounded-xl surface-1 p-4 space-y-3">
        <h4 className="text-xs font-medium text-foreground uppercase tracking-wider">
          Scope
        </h4>
        <div className="space-y-2">
          <PathListEditor
            label="Include Paths"
            paths={config.scope.include}
            onChange={(include) =>
              setConfig({ ...config, scope: { ...config.scope, include } })
            }
          />
          <PathListEditor
            label="Exclude Paths"
            paths={config.scope.exclude}
            onChange={(exclude) =>
              setConfig({ ...config, scope: { ...config.scope, exclude } })
            }
          />
          <PathListEditor
            label="Critical Paths"
            paths={config.scope.critical}
            onChange={(critical) =>
              setConfig({ ...config, scope: { ...config.scope, critical } })
            }
          />
        </div>
      </div>

      {/* Coverage Config */}
      <div className="rounded-xl surface-1 p-4 space-y-3">
        <h4 className="text-xs font-medium text-foreground uppercase tracking-wider">
          Coverage Targets
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Overall Target (%)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={config.coverage.target}
              onChange={(e) =>
                setConfig({
                  ...config,
                  coverage: { ...config.coverage, target: parseInt(e.target.value, 10) || 0 },
                })
              }
              className="bg-muted/40 w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Critical Path Target (%)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={config.coverage.criticalTarget}
              onChange={(e) =>
                setConfig({
                  ...config,
                  coverage: { ...config.coverage, criticalTarget: parseInt(e.target.value, 10) || 0 },
                })
              }
              className="bg-muted/40 w-24"
            />
          </div>
        </div>
      </div>

      {/* Execution Config */}
      <div className="rounded-xl surface-1 p-4 space-y-3">
        <h4 className="text-xs font-medium text-foreground uppercase tracking-wider">
          Execution
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mode</Label>
            <select
              value={config.execution.mode}
              onChange={(e) =>
                setConfig({
                  ...config,
                  execution: { ...config.execution, mode: e.target.value },
                })
              }
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="autonomous">Autonomous</option>
              <option value="human-in-loop">Human-in-Loop</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Flakiness Tolerance (retries)
            </Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={config.execution.flakinessTolerance}
              onChange={(e) =>
                setConfig({
                  ...config,
                  execution: {
                    ...config.execution,
                    flakinessTolerance: parseInt(e.target.value, 10) || 0,
                  },
                })
              }
              className="bg-muted/40 w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Parallel Browsers (1-50)
            </Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={config.execution.maxParallelBrowsers}
              onChange={(e) =>
                setConfig({
                  ...config,
                  execution: {
                    ...config.execution,
                    maxParallelBrowsers: parseInt(e.target.value, 10) || 1,
                  },
                })
              }
              className="bg-muted/40 w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Failure Threshold (%)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={config.execution.failureThreshold}
              onChange={(e) =>
                setConfig({
                  ...config,
                  execution: {
                    ...config.execution,
                    failureThreshold: parseInt(e.target.value, 10) || 0,
                  },
                })
              }
              className="bg-muted/40 w-24"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PathListEditor({
  label,
  paths,
  onChange,
}: {
  label: string;
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {paths.map((path, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 text-foreground/80"
          >
            {path}
            <button
              type="button"
              onClick={() => onChange(paths.filter((_, j) => j !== i))}
              className="text-muted-foreground/50 hover:text-orbit-fail ml-0.5"
            >
              x
            </button>
          </span>
        ))}
        <Input
          placeholder="Add path..."
          className="bg-muted/40 text-xs h-6 w-32"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) {
                onChange([...paths, value]);
                (e.target as HTMLInputElement).value = "";
              }
            }
          }}
        />
      </div>
    </div>
  );
}
