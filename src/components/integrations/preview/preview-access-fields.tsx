"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorText, sendJson } from "./send-json";

export interface AccessDraft {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

interface PreviewAccessFieldsProps {
  projectId: string;
  draft: AccessDraft;
  onChange: (draft: AccessDraft) => void;
  /** A token is already stored; blank fields keep it */
  hasStoredToken: boolean;
  /** Prefills the test URL, e.g. the latest preview */
  sampleUrl: string | null;
  canTest: boolean;
}

interface ProbeResult {
  protectedWithoutToken: boolean;
  allowedWithToken: boolean;
  message: string;
}

/** Optional Cloudflare Access service token for previews behind Access, with a two-probe test. */
export function PreviewAccessFields({ projectId, draft, onChange, hasStoredToken, sampleUrl, canTest }: PreviewAccessFieldsProps) {
  const id = useId();
  const [testUrl, setTestUrl] = useState(sampleUrl ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const data = await sendJson<ProbeResult>(`/api/projects/${projectId}/preview-binding/test-access`, "POST", {
        url: testUrl,
        ...(draft.clientId && draft.clientSecret ? { clientId: draft.clientId, clientSecret: draft.clientSecret } : {}),
      });
      setResult({ ok: data.allowedWithToken, message: data.message });
    } catch (err) {
      setResult({ ok: false, message: errorText(err, "Test failed") });
    } finally {
      setTesting(false);
    }
  }

  const testBlocked = !canTest ? "Save a preview source first" : !testUrl.trim() ? "Enter a preview URL" : null;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor={`${id}-on`} className="text-sm text-foreground">Previews are behind Cloudflare Access</Label>
          <p className="text-xs text-muted-foreground text-pretty mt-0.5">
            Orbit sends a service token on requests to the preview&apos;s own origin only. The Access policy needs a Service Auth rule.
          </p>
        </div>
        <Switch id={`${id}-on`} checked={draft.enabled} onCheckedChange={(enabled) => onChange({ ...draft, enabled })} />
      </div>

      {draft.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-cid`} className="text-xs text-muted-foreground">Client ID</Label>
              <Input id={`${id}-cid`} autoComplete="off" spellCheck={false} value={draft.clientId}
                placeholder={hasStoredToken ? "Saved: leave blank to keep" : "xxxx.access"}
                onChange={(e) => onChange({ ...draft, clientId: e.target.value })} className="bg-muted/40 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-cs`} className="text-xs text-muted-foreground">Client secret</Label>
              <Input id={`${id}-cs`} type="password" autoComplete="off" value={draft.clientSecret}
                placeholder={hasStoredToken ? "Saved: leave blank to keep" : "Client secret"}
                onChange={(e) => onChange({ ...draft, clientSecret: e.target.value })} className="bg-muted/40 font-mono" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Stored as the project secrets CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET.</p>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-url`} className="text-xs text-muted-foreground">Preview URL to test</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id={`${id}-url`} type="url" value={testUrl} placeholder="https://abc123.my-site.pages.dev"
                onChange={(e) => setTestUrl(e.target.value)} className="bg-muted/40 font-mono max-w-md"
                aria-describedby={`${id}-result`} />
              <Button type="button" size="sm" variant="outline" onClick={test} disabled={testing || !!testBlocked} aria-busy={testing}>
                {testing ? "Testing…" : "Test access"}
              </Button>
              {testBlocked && <span className="text-xs text-muted-foreground">{testBlocked}</span>}
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              The saved token is only sent to a recent preview&apos;s URL. To test another URL, enter the token above.
            </p>
            <p id={`${id}-result`} aria-live="polite" className={result?.ok ? "text-xs text-orbit-pass" : "text-xs text-red-400"}>
              {result && <><span aria-hidden>{result.ok ? "✓ " : "✕ "}</span>{result.message}</>}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
