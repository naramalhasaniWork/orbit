"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, RotateCcw, History, FileText, Hash } from "lucide-react";

interface PromptCreator {
  id: string;
  name: string | null;
  email: string | null;
}

interface PromptActive {
  id: string | null;
  content: string;
  version: number;
  promptType: string;
  changelog: string | null;
  createdBy: PromptCreator | null;
  createdAt: string | null;
}

interface PromptHistoryEntry {
  id: string;
  version: number;
  promptType: string;
  changelog: string | null;
  isActive: boolean;
  createdBy: PromptCreator | null;
  createdAt: string;
}

export interface PhaseData {
  active: PromptActive;
  history: PromptHistoryEntry[];
  defaultContent: string;
}

const PHASE_LABELS: Record<string, string> = {
  analyst: "Analyst",
  planner: "Planner",
  executor: "Executor",
  reporter: "Reporter",
  auditor: "Auditor",
};

interface PhaseEditorProps {
  phase: string;
  data: PhaseData;
  onSaved: (updated: PhaseData) => void;
}

export function PromptPhaseEditor({ phase, data, onSaved }: PhaseEditorProps) {
  const [content, setContent] = useState(data.active.content);
  const [changelog, setChangelog] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPhase: phase, content, changelog: changelog || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        const saved = json.data;
        const newHistory: PromptHistoryEntry = {
          id: saved.id, version: saved.version, promptType: saved.promptType,
          changelog: saved.changelog, isActive: true, createdBy: saved.createdBy, createdAt: saved.createdAt,
        };
        onSaved({
          ...data,
          active: { id: saved.id, content: saved.content, version: saved.version, promptType: saved.promptType, changelog: saved.changelog, createdBy: saved.createdBy, createdAt: saved.createdAt },
          history: [newHistory, ...data.history.map((h) => ({ ...h, isActive: false }))],
        });
        setEditing(false);
        setChangelog("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="rounded-xl surface-1 border border-white/[0.04] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orbit-accent" />
            <h3 className="text-sm font-medium text-foreground">{PHASE_LABELS[phase]} Prompt</h3>
            <Badge variant="accent">v{data.active.version}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              ~{estimateTokens(content).toLocaleString()} tokens
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-3.5 w-3.5 mr-1" />History
            </Button>
            {!editing && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[300px] font-mono text-xs bg-white/[0.02] border-white/[0.06]" />
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Changelog</Label>
                <Input value={changelog} onChange={(e) => setChangelog(e.target.value)} placeholder="Describe what changed..." className="mt-1 h-8 text-sm bg-white/[0.02] border-white/[0.06]" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Button variant="ghost" size="sm" onClick={() => setContent(data.defaultContent)} title="Reset to default">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setContent(data.active.content); setEditing(false); }}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
                  <Save className="h-3.5 w-3.5 mr-1" />{saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap bg-white/[0.02] rounded-lg p-4 border border-white/[0.04] max-h-[400px] overflow-auto">
            {content}
          </pre>
        )}

        {data.active.createdBy && (
          <p className="text-xs text-muted-foreground">
            Last edited by {data.active.createdBy.name ?? data.active.createdBy.email}
            {data.active.createdAt && ` on ${new Date(data.active.createdAt).toLocaleDateString()}`}
          </p>
        )}
      </div>

      {showHistory && (
        <div className="rounded-xl surface-1 border border-white/[0.04] p-5 space-y-3">
          <h4 className="text-sm font-medium text-foreground">Version History</h4>
          {data.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No version history yet.</p>
          ) : (
            <div className="space-y-2">
              {data.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                  <div className="flex items-center gap-2">
                    <Badge variant={h.isActive ? "accent" : "secondary"} className="text-[10px] h-5">v{h.version}</Badge>
                    {h.isActive && <Badge variant="pass" className="text-[10px] h-5">Active</Badge>}
                    <span className="text-xs text-muted-foreground">{h.changelog ?? "No changelog"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{h.createdBy?.name ?? h.createdBy?.email ?? "System"}</span>
                    <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
