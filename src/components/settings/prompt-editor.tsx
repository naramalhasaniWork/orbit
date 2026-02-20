"use client";

import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Save, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PromptVersionHistory } from "./prompt-version-history";

const AGENT_LABELS: Record<string, string> = {
  analyst: "Analyst Agent",
  planner: "Planner Agent",
  executor: "Executor Agent",
  reporter: "Reporter Agent",
  auditor: "Auditor Agent",
};

interface PromptData {
  agentPhase: string;
  customInstructions: string | null;
  assembledPrompt: string;
}

interface PromptEditorProps {
  workspaceId: string;
  agentPhase: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptEditor({ workspaceId, agentPhase, open, onOpenChange }: PromptEditorProps) {
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [fullPrompt, setFullPrompt] = useState("");
  const [editFull, setEditFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showChangelogDialog, setShowChangelogDialog] = useState(false);
  const [changelog, setChangelog] = useState("");

  const label = AGENT_LABELS[agentPhase] ?? agentPhase;

  const fetchPrompt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/prompts/${agentPhase}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        const data = json.data as PromptData;
        setPrompt(data);
        setCustomInstructions(data.customInstructions ?? "");
        setFullPrompt(data.assembledPrompt ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, agentPhase]);

  useEffect(() => {
    if (open) fetchPrompt();
  }, [open, fetchPrompt]);

  async function confirmSave() {
    setSaving(true);
    setShowChangelogDialog(false);
    try {
      const body: Record<string, unknown> = { changelog: changelog || null };
      if (editFull) {
        body.content = fullPrompt;
        body.promptType = "user";
      } else {
        body.customInstructions = customInstructions;
      }

      const res = await fetch(`/api/workspaces/${workspaceId}/prompts/${agentPhase}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setChangelog("");
        await fetchPrompt();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/prompts/${agentPhase}`, {
        method: "DELETE",
      });
      await fetchPrompt();
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(versionId: string) {
    setSaving(true);
    try {
      await fetch(
        `/api/workspaces/${workspaceId}/prompts/${agentPhase}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      await fetchPrompt();
    } finally {
      setSaving(false);
    }
  }

  const charCount = editFull ? fullPrompt.length : customInstructions.length;
  const estimatedTokens = Math.ceil(charCount / 4);

  // Suppress unused variable warning — prompt is used for initial data load
  void prompt;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Prompt - {label}</DialogTitle>
            <DialogDescription>
              Customize the system prompt for this agent phase.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <Tabs defaultValue="custom">
                <TabsList>
                  <TabsTrigger value="custom">Custom Instructions</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>

                <TabsContent value="custom" className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Custom Instructions
                    </Label>
                    <textarea
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="Add custom instructions for this agent..."
                      rows={8}
                      className="w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orbit-accent resize-y font-mono"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">
                        These instructions are appended to the agent&apos;s system prompt.
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {charCount.toLocaleString()} chars / ~{estimatedTokens.toLocaleString()} tokens
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">
                        Edit Full Prompt
                      </Label>
                      <Switch checked={editFull} onCheckedChange={setEditFull} />
                    </div>
                    {editFull && (
                      <div className="flex items-center gap-1.5 text-orbit-flaky">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px]">
                          Modifying the full prompt may break agent output format
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2 text-[10px]">
                      <Badge variant="outline" className="text-[9px]">Operator</Badge>
                      <Badge variant="outline" className="text-[9px]">User</Badge>
                      <Badge variant="outline" className="text-[9px]">Agent</Badge>
                    </div>
                    <textarea
                      value={fullPrompt}
                      onChange={(e) => setFullPrompt(e.target.value)}
                      readOnly={!editFull}
                      rows={16}
                      className={`w-full rounded-md border border-transparent px-3 py-2 text-xs text-foreground font-mono resize-y focus:outline-none focus:ring-1 focus:ring-orbit-accent ${
                        editFull ? "bg-white/[0.04]" : "bg-white/[0.02] cursor-default"
                      }`}
                    />
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground">
                        {fullPrompt.length.toLocaleString()} chars / ~{Math.ceil(fullPrompt.length / 4).toLocaleString()} tokens
                      </span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <PromptVersionHistory
                workspaceId={workspaceId}
                agentPhase={agentPhase}
                onRestore={handleRestore}
                disabled={saving}
              />

              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => setShowChangelogDialog(true)}
                  disabled={saving}
                  className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
                >
                  {saving ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="h-3.5 w-3.5" /> Save</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  disabled={saving}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showChangelogDialog} onOpenChange={setShowChangelogDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Changes</DialogTitle>
            <DialogDescription>
              Optionally describe what you changed.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="e.g. Added safety instructions"
            className="bg-white/[0.04]"
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setShowChangelogDialog(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmSave}
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
