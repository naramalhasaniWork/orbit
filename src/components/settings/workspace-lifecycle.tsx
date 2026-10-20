"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearWorkspaceCookie } from "@/lib/workspace-cookie";

interface WorkspaceLifecycleProps {
  workspace: { id: string; name: string };
  role: string | null;
}

async function call(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message ?? "Request failed");
  }
}

/** Leave or delete the workspace; both send the user back to a workspace they still belong to. */
export function WorkspaceLifecycle({ workspace, role }: WorkspaceLifecycleProps) {
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState<"leave" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = role === "owner";

  async function run(kind: "leave" | "delete") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "leave") {
        if (!window.confirm(`Leave ${workspace.name}? You will lose access until invited again.`)) {
          return;
        }
        await call(`/api/workspaces/${workspace.id}/leave`, "POST");
      } else {
        await call(`/api/workspaces/${workspace.id}`, "DELETE", { confirmName });
      }
      // The session still points at this workspace; drop the preference and re-resolve
      clearWorkspaceCookie();
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-6">
      <h3 className="text-sm font-medium text-foreground">Leave or delete</h3>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {isOwner
            ? "As the owner you must transfer ownership to another member (Team page) before you can leave."
            : "Leave this workspace. An admin will need to invite you again to rejoin."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isOwner || busy !== null}
          onClick={() => run("leave")}
        >
          {busy === "leave" ? "Leaving..." : "Leave workspace"}
        </Button>
      </div>

      {isOwner && (
        <div className="space-y-3 border-t border-border pt-6 max-w-md">
          <p className="text-xs text-muted-foreground">
            Deleting hides the workspace and its projects from every member. Cancel any
            subscription in Billing first. Type <strong className="text-foreground">{workspace.name}</strong> to confirm.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ws-delete-confirm" className="text-xs text-muted-foreground">
              Workspace name
            </Label>
            <Input
              id="ws-delete-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="bg-foreground/[0.04]"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-orbit-fail border-orbit-fail/30 hover:bg-orbit-fail/10"
            disabled={confirmName !== workspace.name || busy !== null}
            onClick={() => run("delete")}
          >
            {busy === "delete" ? "Deleting..." : "Delete workspace"}
          </Button>
        </div>
      )}

      {error && <div className="text-xs text-orbit-fail">{error}</div>}
    </div>
  );
}
