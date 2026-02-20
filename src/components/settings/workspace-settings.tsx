"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WorkspaceSettings {
  customPrompt?: string;
}

interface WorkspaceSettingsProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    settings?: WorkspaceSettings;
  } | null;
}

export function WorkspaceSettings({ workspace }: WorkspaceSettingsProps) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [customPrompt, setCustomPrompt] = useState(
    workspace?.settings?.customPrompt ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  if (!workspace) {
    return (
      <div className="rounded-xl surface-1 p-8 text-center">
        <p className="text-sm text-muted-foreground">No workspace found.</p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: workspace?.id, name }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePrompt() {
    setSavingPrompt(true);
    try {
      await fetch(`/api/workspaces/${workspace?.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPrompt }),
      });
    } finally {
      setSavingPrompt(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl surface-1 p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Workspace</h3>

        <div className="grid gap-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="ws-name" className="text-xs text-muted-foreground">
              Workspace Name
            </Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/[0.04]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Workspace ID</Label>
            <div className="text-sm text-foreground font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent">
              {workspace.id}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Slug</Label>
            <div className="text-sm text-foreground font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent">
              {workspace.slug}
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || name === workspace.name}
            size="sm"
            className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl surface-1 p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          Custom AI Instructions
        </h3>
        <p className="text-xs text-muted-foreground">
          Provide additional context for Orbit&apos;s AI agents. This will be included
          in all agent prompts for your workspace. Use this to describe your
          application, testing priorities, or domain-specific instructions.
        </p>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g., This is a construction SaaS. Test the bid creation flow thoroughly. Always test with the admin user first."
          rows={5}
          className="w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orbit-accent resize-y"
        />
        <Button
          onClick={handleSavePrompt}
          disabled={savingPrompt || customPrompt === (workspace.settings?.customPrompt ?? "")}
          size="sm"
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
        >
          {savingPrompt ? "Saving..." : "Save Instructions"}
        </Button>
      </div>

      <div className="rounded-xl surface-1 p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">API Access</h3>
        <p className="text-xs text-muted-foreground">
          Use your workspace API key to trigger runs programmatically and integrate with CI/CD.
        </p>
        <div className="text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 border border-transparent text-muted-foreground">
          {"••••••••••••••••••••••••••••••••"}
        </div>
        <Button size="sm" variant="outline">
          Regenerate API Key
        </Button>
      </div>
    </div>
  );
}
