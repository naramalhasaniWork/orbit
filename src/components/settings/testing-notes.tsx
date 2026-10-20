"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  StickyNote,
  AlertTriangle,
  Key,
  BookOpen,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TestingNote {
  id: string;
  content: string;
  category: "context" | "instruction" | "known-issue" | "credential-hint";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TestingNotesProps {
  projectId: string | null;
}

const CATEGORIES = [
  { id: "context" as const, label: "Context", icon: BookOpen, color: "text-tm-info" },
  { id: "instruction" as const, label: "Instruction", icon: StickyNote, color: "text-tm-warn" },
  { id: "known-issue" as const, label: "Known Issue", icon: AlertTriangle, color: "text-tm-warn" },
  { id: "credential-hint" as const, label: "Credential Hint", icon: Key, color: "text-tm-t2" },
] as const;

export function TestingNotes({ projectId }: TestingNotesProps) {
  const [notes, setNotes] = useState<TestingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<TestingNote["category"]>("context");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`);
      if (res.ok) {
        const { data } = await res.json();
        setNotes(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function handleAdd() {
    if (!projectId || !newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent.trim(), category: newCategory }),
      });
      if (res.ok) {
        const { data: note } = await res.json();
        setNotes((prev) => [...prev, note]);
        setNewContent("");
        setNewCategory("context");
        setShowAdd(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(noteId: string, active: boolean) {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, active }),
    });
    if (res.ok) {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, active } : n)));
    }
  }

  async function handleDelete(noteId: string) {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/notes?noteId=${noteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  }

  if (!projectId) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No project selected.
      </div>
    );
  }

  const activeCount = notes.filter((n) => n.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Testing Notes</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Add context that Orbit uses when planning and executing tests.
            Active notes are injected into agent prompts dynamically.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAdd(!showAdd)}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Note
        </Button>
      </div>

      {activeCount > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-tm-pass">
          <CircleDot className="h-3 w-3" />
          {activeCount} active note{activeCount !== 1 ? "s" : ""} feeding into agents
        </div>
      )}

      {showAdd && (
        <div className="border border-border rounded-lg p-3 space-y-3 bg-foreground/[0.02]">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="e.g. 'Skip login tests until auth bug #42 is fixed' or 'Admin panel is at /admin, not /dashboard'"
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 resize-y min-h-[80px] focus:outline-none focus:border-border"
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Category:</span>
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setNewCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors border",
                    newCategory === cat.id
                      ? "border-border bg-foreground/[0.06] text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-3 w-3", cat.color)} />
                  {cat.label}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowAdd(false); setNewContent(""); }}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newContent.trim()}
              className="h-7 text-xs"
            >
              {saving ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
      ) : notes.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-1.5">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  onToggle,
  onDelete,
}: {
  note: TestingNote;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === note.category) ?? CATEGORIES[0];
  const Icon = cat.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 rounded-md border transition-colors group",
        note.active
          ? "border-border bg-foreground/[0.02]"
          : "border-border bg-transparent opacity-50"
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(note.id, !note.active)}
        className={cn(
          "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
          note.active
            ? "border-tm-pass bg-tm-pass/20"
            : "border-border bg-transparent"
        )}
      >
        {note.active && (
          <div className="h-1.5 w-1.5 rounded-full bg-tm-pass" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon className={cn("h-3 w-3 shrink-0", cat.color)} />
          <span className=" text-muted-foreground tm-label">
            {cat.label}
          </span>
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
          {note.content}
        </p>
        <span className="text-[10px] text-muted-foreground/50 mt-1 block">
          {new Date(note.createdAt).toLocaleDateString()}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onDelete(note.id)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-tm-fail transition-all mt-0.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-lg py-8 px-4 text-center">
      <StickyNote className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-1">No testing notes yet</p>
      <p className="text-[11px] text-muted-foreground/70 max-w-sm mx-auto mb-4">
        Notes give Orbit context about your project. For example: &ldquo;skip
        login tests until auth is fixed&rdquo;, &ldquo;use project ID 123 for
        submittal tests&rdquo;, or &ldquo;the admin panel is at /admin&rdquo;.
      </p>
      <Button size="sm" variant="outline" onClick={onAdd} className="h-7 text-xs gap-1">
        <Plus className="h-3 w-3" />
        Add Your First Note
      </Button>
    </div>
  );
}
