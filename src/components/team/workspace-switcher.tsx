"use client";

import { useState, useEffect, FormEvent } from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  tier: string;
  role: string;
}

interface WorkspaceSwitcherProps {
  currentWorkspaceId: string;
  currentWorkspaceName?: string;
}

export function WorkspaceSwitcher({
  currentWorkspaceId,
  currentWorkspaceName,
}: WorkspaceSwitcherProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const res = await fetch("/api/workspaces");
        const json = await res.json();
        if (json.success) setWorkspaces(json.data);
      } finally {
        setLoading(false);
      }
    }
    fetchWorkspaces();
  }, []);

  function handleSwitch(workspace: Workspace) {
    if (workspace.id === currentWorkspaceId) return;
    document.cookie = `orbit_workspace=${workspace.id};path=/;max-age=${30 * 24 * 60 * 60}`;
    window.location.href = "/dashboard";
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message ?? "Failed to create workspace");
        return;
      }

      // Set the new workspace as active and reload
      document.cookie = `orbit_workspace=${json.data.id};path=/;max-age=${30 * 24 * 60 * 60}`;
      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  const current = workspaces.find((w) => w.id === currentWorkspaceId);
  const displayName = current?.name ?? currentWorkspaceName ?? "Workspace";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="h-6 w-6 rounded-md bg-orbit-accent/15 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-orbit-accent">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {displayName}
            </span>
            <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {loading ? (
            <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : (
            workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => handleSwitch(ws)}
                className={cn("gap-2 cursor-pointer")}
              >
                <div className="h-5 w-5 rounded bg-muted/50 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-muted-foreground">
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="flex-1 truncate">{ws.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {ws.role}
                </span>
                {ws.id === currentWorkspaceId && (
                  <Check className="h-3.5 w-3.5 text-orbit-accent shrink-0" />
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 cursor-pointer text-muted-foreground"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setNewName("");
          setError("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Create a new workspace to organize your projects and team.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  placeholder="My Workspace"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !newName.trim()}
                className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
              >
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
