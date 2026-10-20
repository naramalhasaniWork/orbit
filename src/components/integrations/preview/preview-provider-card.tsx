"use client";

import { useState } from "react";
import { Cloud, Train } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PreviewProviderInfo } from "@/services/preview/catalog";
import type { ConnectionSummary } from "@/services/preview/connection-service";
import { ConfirmDialog } from "./confirm-dialog";
import { PreviewConnectForm } from "./preview-connect-form";
import { PreviewWebhookSetup } from "./preview-webhook-setup";
import { errorText, sendJson } from "./send-json";

export interface PreviewConnectionState {
  connection: ConnectionSummary | null;
  webhookUrl: string | null;
}

interface ConnectResponse extends PreviewConnectionState {
  webhookToken: string | null;
}

const ICONS: Record<string, typeof Train> = { railway: Train, cloudflare_pages: Cloud };

/** One preview provider on the Integrations tab, driven by the provider catalog. */
export function PreviewProviderCard({ info, initial }: { info: PreviewProviderInfo; initial: PreviewConnectionState }) {
  const [state, setState] = useState(initial);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/integrations/${info.id}`;
  const connection = state.connection;
  const Icon = ICONS[info.id] ?? Cloud;

  async function connect(values: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const data = await sendJson<ConnectResponse>(endpoint, "POST", values);
      setState({ connection: data.connection, webhookUrl: data.webhookUrl });
      if (data.webhookToken) setWebhookToken(data.webhookToken);
      setReplacing(false);
    } catch (err) {
      setError(errorText(err, `Could not connect ${info.name}`));
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setError(null);
    try {
      const data = await sendJson<ConnectResponse>(endpoint, "POST", { rotateWebhookToken: true });
      setState({ connection: data.connection, webhookUrl: data.webhookUrl });
      setWebhookToken(data.webhookToken);
    } catch (err) {
      setError(errorText(err, "Could not generate a webhook token"));
    }
  }

  async function disconnect() {
    setError(null);
    try {
      await sendJson(endpoint, "DELETE");
      setState({ connection: null, webhookUrl: null });
      setWebhookToken(null);
    } catch (err) {
      setError(errorText(err, `Could not disconnect ${info.name}`));
    }
  }

  return (
    <div className="rounded-xl surface-1 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
            <Icon className="size-4 text-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">{info.name}</h3>
            <p className="text-xs text-muted-foreground truncate">{info.description}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={connection?.status === "error" ? "text-orbit-fail border-orbit-fail/30"
            : connection ? "text-orbit-pass border-orbit-pass/30" : "text-muted-foreground"}
        >
          {connection?.status === "error" ? "✕ Needs attention" : connection ? "✓ Connected" : "Not connected"}
        </Badge>
      </div>

      {!connection || replacing ? (
        <PreviewConnectForm
          info={info}
          busy={busy}
          error={error}
          submitLabel={replacing ? "Replace token" : `Connect ${info.name}`}
          onSubmit={connect}
          onCancel={replacing ? () => { setReplacing(false); setError(null); } : undefined}
        />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {connection.accountId && (<><dt className="text-muted-foreground">Account</dt><dd className="font-mono truncate">{connection.accountId}</dd></>)}
            <dt className="text-muted-foreground">Used by</dt>
            <dd className="tabular-nums">
              {connection.bindingCount === 0
                ? "No project yet: pick it as a project's preview source under Settings → Environments"
                : `${connection.bindingCount} project${connection.bindingCount === 1 ? "" : "s"}`}
            </dd>
            {connection.lastError && (<><dt className="text-muted-foreground">Last error</dt><dd className="text-orbit-fail text-pretty">{connection.lastError}</dd></>)}
          </dl>

          {info.usesWebhook && state.webhookUrl && (
            <PreviewWebhookSetup
              webhookUrl={state.webhookUrl}
              webhookToken={webhookToken}
              hasWebhookToken={connection.hasWebhookToken}
              onRotate={rotate}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setReplacing(true)}>Replace token</Button>
            <ConfirmDialog
              trigger={<Button size="sm" variant="outline">Disconnect</Button>}
              title={`Disconnect ${info.name}?`}
              description={`Projects using ${info.name} as their preview source stop waiting for previews, and their preview history is deleted. PRs go back to testing the default environment.`}
              confirmLabel="Disconnect"
              onConfirm={disconnect}
            />
          </div>
          {error && <p role="alert" className="text-xs text-tm-fail text-pretty">{error}</p>}
        </div>
      )}
    </div>
  );
}
