"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearWorkspaceCookie, setWorkspaceCookie } from "@/lib/workspace-cookie";

/**
 * Shown when the session's workspace was deleted or the user no longer belongs
 * to it. Moves the session to another workspace, or offers to create one.
 */
export function WorkspaceRecovery() {
  const { update } = useSession();
  const [noWorkspace, setNoWorkspace] = useState(false);
  const [creating, setCreating] = useState(false);

  async function switchTo(workspaceId: string) {
    await update({ workspaceId });
    setWorkspaceCookie(workspaceId);
    window.location.href = "/dashboard";
  }

  useEffect(() => {
    clearWorkspaceCookie();
    async function recover() {
      const res = await fetch("/api/workspaces");
      const json = await res.json().catch(() => null);
      const first = json?.success ? (json.data as Array<{ id: string }>)[0] : undefined;
      if (first) await switchTo(first.id);
      else setNoWorkspace(true);
    }
    recover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createWorkspace() {
    setCreating(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Workspace" }),
    });
    const json = await res.json().catch(() => null);
    if (json?.success) await switchTo(json.data.id);
    else setCreating(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center surface-0 p-4">
      {noWorkspace ? (
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-lg font-semibold text-foreground">No workspace</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t belong to a workspace. Create one, or ask an admin to invite you.
          </p>
          <Button onClick={createWorkspace} disabled={creating}>
            {creating ? "Creating..." : "Create a workspace"}
          </Button>
        </div>
      ) : (
        <Loader2 className="h-6 w-6 text-orbit-accent animate-spin" />
      )}
    </div>
  );
}
