"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/integrations/preview/confirm-dialog";
import { CopyField } from "@/components/integrations/preview/copy-field";

interface LinearInboundProps {
  workspaceId: string;
  hasInboundUrl: boolean;
  inboundProjectId: string | null;
  projects: Array<{ id: string; name: string }>;
  onChange: (update: { hasInboundUrl?: boolean; inboundProjectId?: string | null }) => void;
}

async function call(url: string, method: "POST" | "PATCH", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Request failed");
  return json?.data;
}

/** The per-connection Linear webhook URL (token shown once) and the project its runs belong to. */
export function LinearInbound({ workspaceId, hasInboundUrl, inboundProjectId, projects, onChange }: LinearInboundProps) {
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/workspaces/${workspaceId}/integrations/linear`;

  async function generate() {
    setError(null);
    try {
      const data = await call(`${base}/inbound`, "POST");
      setWebhookUrl(data.webhookUrl);
      onChange({ hasInboundUrl: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a webhook URL");
    }
  }

  async function chooseProject(value: string) {
    const next = value || null;
    const previous = inboundProjectId;
    onChange({ inboundProjectId: next });
    setError(null);
    try {
      await call(base, "PATCH", { inboundProjectId: next });
    } catch (err) {
      onChange({ inboundProjectId: previous });
      setError(err instanceof Error ? err.message : "Failed to save setting");
    }
  }

  const generateButton = (
    <Button type="button" size="sm" variant="outline">
      {hasInboundUrl ? "Generate new URL" : "Generate URL"}
    </Button>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div>
        <h4 className="text-xs font-medium text-foreground">Inbound webhook</h4>
        <p className="text-xs text-muted-foreground text-pretty mt-0.5">
          In Linear, open Settings → API → Webhooks, add this URL and select Issues. Moving an issue to Done starts a
          regression run; adding the &ldquo;Needs Testing&rdquo; label starts a targeted run.
        </p>
      </div>
      {webhookUrl ? (
        <CopyField label="Webhook URL" value={webhookUrl} help="Shown once: the token in it is stored only as a hash." />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {hasInboundUrl ? (
            <ConfirmDialog
              trigger={generateButton}
              title="Generate a new Linear webhook URL?"
              description="The current URL stops working at once. Update the webhook in Linear with the new one."
              confirmLabel="Generate new URL"
              onConfirm={generate}
            />
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => void generate()}>Generate URL</Button>
          )}
          <span className="text-xs text-muted-foreground">
            {hasInboundUrl ? "The URL is hidden after it is first shown." : "Linear events are rejected until you generate a URL."}
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="linear-inbound-project" className="text-xs text-muted-foreground">Runs go to</Label>
        <select
          id="linear-inbound-project"
          value={inboundProjectId ?? ""}
          onChange={(e) => void chooseProject(e.target.value)}
          className="block w-full max-w-md rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground"
        >
          <option value="">{projects.length === 1 ? projects[0].name : "Choose a project"}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
