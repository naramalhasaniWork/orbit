"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, GitCompare, RefreshCw, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSettingsProps {
  project: { id: string; name: string; slug: string; repoUrl: string | null } | null;
}

interface ProjectSyncInfo {
  autoSync: boolean;
  lastCommitSha?: string;
  lastCommitMessage?: string;
  lastCommitAt?: string;
  commitsBehind?: number;
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivedProjects, setArchivedProjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<ProjectSyncInfo>({ autoSync: false });
  const [syncInfoLoaded, setSyncInfoLoaded] = useState(false);
  const [togglingAutoSync, setTogglingAutoSync] = useState(false);
  const [manualPolling, setManualPolling] = useState(false);

  useEffect(() => {
    fetch("/api/projects?status=archived")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setArchivedProjects(json.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!project?.id) return;
    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.settings) {
          const s = json.data.settings as Record<string, unknown>;
          setSyncInfo({
            autoSync: Boolean(s.autoSync),
            lastCommitSha: s.lastCommitSha as string | undefined,
            lastCommitMessage: s.lastCommitMessage as string | undefined,
            lastCommitAt: s.lastCommitAt as string | undefined,
            commitsBehind: s.commitsBehind as number | undefined,
          });
        }
        setSyncInfoLoaded(true);
      })
      .catch(() => setSyncInfoLoaded(true));
  }, [project?.id]);

  if (!project) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected. Connect a repository first.</p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project?.id, name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Failed to save project");
      }
    } catch {
      setError("Network error — could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project?.id}`, { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Failed to archive project");
      }
    } catch {
      setError("Network error — could not archive");
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(id: string) {
    setRestoring(id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        setArchivedProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } finally {
      setRestoring(null);
    }
  }

  async function handleToggleAutoSync() {
    if (!project?.id) return;
    setTogglingAutoSync(true);
    const newValue = !syncInfo.autoSync;
    try {
      // Load current settings first to merge
      const res = await fetch(`/api/projects/${project.id}`);
      const json = await res.json();
      const currentSettings = (json.data?.settings as Record<string, unknown>) ?? {};

      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ...currentSettings, autoSync: newValue },
        }),
      });
      setSyncInfo((prev) => ({ ...prev, autoSync: newValue }));
    } finally {
      setTogglingAutoSync(false);
    }
  }

  async function handleManualPoll() {
    if (!project?.id) return;
    setManualPolling(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: undefined }),
      });
      if (res.ok) {
        // Re-fetch to get the updated sync info after re-indexing is queued
        setTimeout(async () => {
          const info = await fetch(`/api/projects/${project.id}`).then((r) => r.json());
          if (info.data?.settings) {
            const s = info.data.settings as Record<string, unknown>;
            setSyncInfo({
              autoSync: Boolean(s.autoSync),
              lastCommitSha: s.lastCommitSha as string | undefined,
              lastCommitMessage: s.lastCommitMessage as string | undefined,
              lastCommitAt: s.lastCommitAt as string | undefined,
              commitsBehind: s.commitsBehind as number | undefined,
            });
          }
        }, 2000);
      }
    } finally {
      setManualPolling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl surface-1 p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">General</h3>

        <div className="grid gap-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="project-name" className="text-xs text-muted-foreground">
              Project Name
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/[0.04]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Slug</Label>
            <div className="text-sm text-foreground font-mono bg-white/[0.04] rounded-md px-3 py-2">
              {project.slug}
            </div>
          </div>

          {project.repoUrl && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Repository</Label>
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-orbit-accent hover:underline"
              >
                {project.repoUrl.replace("https://github.com/", "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs text-orbit-fail">{error}</div>
        )}

        <div className="pt-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || name === project.name}
            size="sm"
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {syncInfoLoaded && (
        <div className="rounded-xl surface-1 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                Auto-Sync
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                Orbit checks GitHub for new commits every minute and automatically
                re-indexes when changes are detected.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoSync}
              disabled={togglingAutoSync}
              className={cn(
                "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
                syncInfo.autoSync ? "bg-emerald-500" : "bg-white/10"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  syncInfo.autoSync ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {syncInfo.lastCommitSha && (
            <div className="space-y-1 border border-white/[0.06] rounded-lg px-3 py-2.5 bg-white/[0.02]">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CircleDot className={cn(
                  "h-3 w-3",
                  (syncInfo.commitsBehind ?? 0) > 0 ? "text-yellow-400" : "text-emerald-400"
                )} />
                {(syncInfo.commitsBehind ?? 0) > 0
                  ? `${syncInfo.commitsBehind} new commit${syncInfo.commitsBehind === 1 ? "" : "s"} since last sync`
                  : "Up to date with GitHub"}
              </div>
              <p className="text-[12px] text-foreground/70 font-mono truncate">
                {syncInfo.lastCommitSha.slice(0, 7)}
                {syncInfo.lastCommitMessage && (
                  <span className="font-sans text-muted-foreground ml-2 not-italic">
                    {syncInfo.lastCommitMessage}
                  </span>
                )}
              </p>
              {syncInfo.lastCommitAt && (
                <p className="text-[10px] text-muted-foreground/60">
                  {new Date(syncInfo.lastCommitAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualPoll}
              disabled={manualPolling}
              className="h-7 text-xs gap-1.5"
            >
              <RefreshCw className={cn("h-3 w-3", manualPolling && "animate-spin")} />
              {manualPolling ? "Syncing..." : "Sync Now"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Manually trigger a re-index against the latest commit
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-orbit-flaky/[0.04] p-6 space-y-4">
        <h3 className="text-sm font-medium text-orbit-flaky">Archive Project</h3>
        <p className="text-xs text-muted-foreground">
          Archiving hides this project from your dashboard. All data is preserved and you can restore it anytime from settings.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleArchive}
          disabled={archiving}
          className="border-orbit-flaky/30 text-orbit-flaky hover:bg-orbit-flaky/10"
        >
          {archiving ? "Archiving..." : "Archive Project"}
        </Button>
      </div>

      {archivedProjects.length > 0 && (
        <div className="rounded-xl surface-1 p-6 space-y-4">
          <h3 className="text-sm font-medium text-foreground">Archived Projects</h3>
          <div className="space-y-2">
            {archivedProjects.map((ap) => (
              <div key={ap.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02]">
                <div>
                  <span className="text-sm text-foreground">{ap.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{ap.slug}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(ap.id)}
                  disabled={restoring === ap.id}
                  className="text-xs"
                >
                  {restoring === ap.id ? "Restoring..." : "Restore"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
