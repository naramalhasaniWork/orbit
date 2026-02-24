"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";

interface ProjectSettingsProps {
  project: { id: string; name: string; slug: string; repoUrl: string | null } | null;
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivedProjects, setArchivedProjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects?status=archived")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setArchivedProjects(json.data);
      })
      .catch(() => {});
  }, []);

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
