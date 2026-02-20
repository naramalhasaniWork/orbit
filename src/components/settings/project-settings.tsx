"use client";

import { useState } from "react";
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

  if (!project) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No project selected. Connect a repository first.</p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project?.id, name }),
      });
    } finally {
      setSaving(false);
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

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || name === project.name}
            size="sm"
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-orbit-fail/[0.04] p-6 space-y-4">
        <h3 className="text-sm font-medium text-red-400">Danger Zone</h3>
        <p className="text-xs text-muted-foreground">
          Deleting this project will remove all test plans, runs, and associated data. This action cannot be undone.
        </p>
        <Button variant="destructive" size="sm">
          Delete Project
        </Button>
      </div>
    </div>
  );
}
