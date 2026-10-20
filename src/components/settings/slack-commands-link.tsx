"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/integrations/preview/copy-field";

interface SlackCommandsLinkProps {
  workspaceId: string;
  teamId: string | null;
  pendingTeamId: string | null;
  onChange: (update: { teamId?: string | null; pendingTeamId?: string | null }) => void;
}

/** Links a Slack workspace to this Orbit workspace's `/orbit` commands through a one-time code. */
export function SlackCommandsLink({ workspaceId, teamId, pendingTeamId, onChange }: SlackCommandsLinkProps) {
  const [command, setCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/workspaces/${workspaceId}/integrations/slack/link`;

  async function post(url: string) {
    const res = await fetch(url, { method: "POST" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? "Request failed");
    return json?.data;
  }

  async function getCode() {
    setError(null);
    try {
      setCommand((await post(base)).command);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a link code");
    }
  }

  async function confirm() {
    setError(null);
    try {
      const data = await post(`${base}/confirm`);
      onChange({ teamId: data.teamId, pendingTeamId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the link");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div>
        <h4 className="text-xs font-medium text-foreground">Slash commands</h4>
        <p className="text-xs text-muted-foreground text-pretty mt-0.5">
          {teamId
            ? `Linked to Slack team ${teamId}. /orbit commands from that Slack workspace act on this Orbit workspace.`
            : "Not linked. Get a code and run the command in Slack to let /orbit act on this workspace."}
        </p>
      </div>
      {pendingTeamId && (
        <div className="space-y-2 rounded-md border border-amber-500/30 p-3">
          <p className="text-xs text-foreground text-pretty">
            Slack team {pendingTeamId} ran your link code, but it is linked to another Orbit workspace. Confirm to move
            it here; the other workspace stops receiving its commands.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void confirm()}>Move Slack team here</Button>
        </div>
      )}
      {command ? (
        <CopyField label="Run this in Slack" value={command} help="Works once, for 15 minutes." />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => void getCode()}>
          {teamId ? "Link a different Slack workspace" : "Get link code"}
        </Button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
