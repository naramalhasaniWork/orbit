"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
    // In a full implementation, this would update the session/JWT
    // For now, we store preference and reload
    document.cookie = `orbit_workspace=${workspace.id};path=/;max-age=${30 * 24 * 60 * 60}`;
    window.location.href = "/dashboard";
  }

  const current = workspaces.find((w) => w.id === currentWorkspaceId);
  const displayName = current?.name ?? currentWorkspaceName ?? "Workspace";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
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
              <div className="h-5 w-5 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
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
        <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground">
          <Plus className="h-3.5 w-3.5" />
          Create Workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
