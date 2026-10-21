"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/integrations/preview/copy-field";

/** Another Orbit workspace asking for the Slack team this one holds. */
export interface IncomingSlackClaim {
  workspaceId: string;
  workspaceName: string;
  requestedAt: string;
}

interface SlackCommandsLinkProps {
  workspaceId: string;
  teamId: string | null;
  pendingTeamId: string | null;
  incomingClaims: IncomingSlackClaim[];
  onChange: (update: {
    teamId?: string | null;
    pendingTeamId?: string | null;
    incomingClaims?: IncomingSlackClaim[];
  }) => void;
}

/** Links a Slack workspace to this Orbit workspace's `/orbit` commands through a one-time code. */
export function SlackCommandsLink({ workspaceId, teamId, pendingTeamId, incomingClaims, onChange }: SlackCommandsLinkProps) {
  const [command, setCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/workspaces/${workspaceId}/integrations/slack/link`;

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

  async function linkNow() {
    setError(null);
    try {
      await post(`${base}/confirm`);
      onChange({ teamId: pendingTeamId, pendingTeamId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link the Slack team");
    }
  }

  async function answer(claim: IncomingSlackClaim, approve: boolean) {
    setError(null);
    try {
      await post(`/api/workspaces/${workspaceId}/integrations/slack/claims/${claim.workspaceId}`, { approve });
      onChange({
        incomingClaims: incomingClaims.filter((c) => c.workspaceId !== claim.workspaceId),
        ...(approve ? { teamId: null } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer the request");
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
      {incomingClaims.map((claim) => (
        <div key={claim.workspaceId} role="status" className="space-y-2 rounded-md border border-amber-500/30 p-3">
          <p className="text-xs text-foreground text-pretty">
            The Orbit workspace &ldquo;{claim.workspaceName}&rdquo; ran a link code from your Slack team and asks to take
            over its /orbit commands. Approving moves them there; this workspace stops receiving them. The request
            lapses 24 hours after {new Date(claim.requestedAt).toLocaleString()}.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void answer(claim, true)}>Approve transfer</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void answer(claim, false)}>Decline</Button>
          </div>
        </div>
      ))}
      {pendingTeamId && (
        <div className="space-y-2 rounded-md border border-amber-500/30 p-3">
          <p className="text-xs text-foreground text-pretty">
            Slack team {pendingTeamId} ran your link code, but another Orbit workspace holds it. An admin there must
            approve the transfer within 24 hours. If they disconnect Slack instead, link it here.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void linkNow()}>Link now</Button>
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
