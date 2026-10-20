"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { CopyField } from "./copy-field";

interface PreviewWebhookSetupProps {
  webhookUrl: string;
  /** Plaintext token, only present right after connect or rotation */
  webhookToken: string | null;
  hasWebhookToken: boolean;
  onRotate: () => Promise<void>;
}

/** Railway webhook instructions: the URL plus a one-time X-Orbit-Token value to paste into Railway. */
export function PreviewWebhookSetup({ webhookUrl, webhookToken, hasWebhookToken, onRotate }: PreviewWebhookSetupProps) {
  const generate = (
    <Button type="button" size="sm" variant="outline">
      {hasWebhookToken ? "Generate new token" : "Generate token"}
    </Button>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div>
        <h4 className="text-xs font-medium text-foreground">Deployment webhook</h4>
        <p className="text-xs text-muted-foreground text-pretty mt-0.5">
          In Railway, open the project → Settings → Webhooks, add this URL, and add a header named
          X-Orbit-Token with the token below. Orbit also polls every 2 minutes, so the webhook only makes it faster.
        </p>
      </div>
      <CopyField label="Webhook URL" value={webhookUrl} />
      {webhookToken ? (
        <CopyField
          label="X-Orbit-Token header value"
          value={webhookToken}
          help="Shown once. Orbit stores only a hash of it."
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {hasWebhookToken ? (
            <ConfirmDialog
              trigger={generate}
              title="Generate a new webhook token?"
              description="The current token stops working at once. Update the X-Orbit-Token header in Railway with the new value."
              confirmLabel="Generate new token"
              onConfirm={onRotate}
            />
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => void onRotate()}>Generate token</Button>
          )}
          <span className="text-xs text-muted-foreground">
            {hasWebhookToken ? "The token is hidden after it is first shown." : "No token yet: Railway webhooks are rejected until you generate one."}
          </span>
        </div>
      )}
    </div>
  );
}
