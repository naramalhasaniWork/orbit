"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { WorkspaceMark } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { setWorkspaceCookie } from "@/lib/workspace-cookie";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  tier: string;
  role: string;
  /** GitHub org avatar of the workspace's first installation. */
  image: string | null;
}

interface WorkspaceSwitcherProps {
  currentWorkspaceId: string;
  currentWorkspaceName?: string;
}

export function WorkspaceSwitcher({
  currentWorkspaceId,
  currentWorkspaceName,
}: WorkspaceSwitcherProps) {
  const { update: updateSession } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
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

  async function handleSwitch(workspace: Workspace) {
    if (workspace.id === currentWorkspaceId) return;
    setSwitching(workspace.id);
    try {
      // Update the JWT with the new workspace via NextAuth's built-in mechanism
      await updateSession({ workspaceId: workspace.id });
      // Persist preference in cookie for cross-session persistence
      setWorkspaceCookie(workspace.id);
      window.location.href = "/dashboard";
    } catch {
      setSwitching(null);
    }
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

      // Update JWT with the new workspace, persist cookie, and reload
      await updateSession({ workspaceId: json.data.id });
      setWorkspaceCookie(json.data.id);
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
            <WorkspaceMark id={currentWorkspaceId} name={displayName} image={current?.image} size="sm" />
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
                disabled={switching === ws.id}
                className={cn("gap-2 cursor-pointer")}
              >
                {switching === ws.id ? (
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    <Pending />
                  </span>
                ) : (
                  <WorkspaceMark id={ws.id} name={ws.name} image={ws.image} size="sm" />
                )}
                <span className="flex-1 truncate">{ws.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {ws.role}
                </span>
                {ws.id === currentWorkspaceId && !switching && (
                  <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
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
                className="bg-primary hover:bg-primary/85 text-primary-foreground"
              >
                
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
