"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PREVIEW_PROVIDER_CATALOG, providerInfo } from "@/services/preview/catalog";
import type { ConnectionSummary } from "@/services/preview/connection-service";
import { ConfirmDialog } from "./confirm-dialog";
import { PreviewAccessFields, type AccessDraft } from "./preview-access-fields";
import { PreviewDeploymentsList, type PreviewDeploymentRow } from "./preview-deployments-list";
import { errorText, sendJson } from "./send-json";

interface BindingView {
  binding: {
    targetRef: string;
    targetLabel: string | null;
    allowedHostSuffixes: string[];
    accessSecretPrefix: string | null;
    connection: { provider: string };
  } | null;
  deployments: PreviewDeploymentRow[];
  connections: ConnectionSummary[];
}

interface Draft {
  provider: string;
  targetRef: string;
  hosts: string;
  access: AccessDraft;
}

function draftFrom(view: BindingView): Draft {
  const b = view.binding;
  const provider = b?.connection.provider ?? view.connections[0]?.provider ?? "";
  return {
    provider,
    targetRef: b?.targetRef ?? "",
    hosts: (b?.allowedHostSuffixes ?? providerInfo(provider)?.defaultHostSuffixes ?? []).join(", "),
    access: { enabled: !!b?.accessSecretPrefix, clientId: "", clientSecret: "" },
  };
}

/** Project → Environments: where this project's PR previews come from, and recent previews. */
export function PreviewSourceSettings({ projectId, onOpenIntegrations }: { projectId: string; onOpenIntegrations: () => void }) {
  const id = useId();
  const base = `/api/projects/${projectId}/preview-binding`;
  const [view, setView] = useState<BindingView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [targets, setTargets] = useState<Array<{ ref: string; label: string }> | null>(null);
  const [busy, setBusy] = useState<"save" | "import" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await sendJson<BindingView>(base, "GET");
      setView(data);
      setDraft(draftFrom(data));
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Could not load the preview source") });
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  const provider = draft?.provider;
  useEffect(() => {
    if (!provider) return;
    setTargets(null);
    sendJson<{ targets: Array<{ ref: string; label: string }> }>(`/api/integrations/${provider}/targets`, "GET")
      .then((d) => setTargets(d.targets))
      .catch((err) => { setTargets([]); setMessage({ ok: false, text: errorText(err, "Could not list targets") }); });
  }, [provider]);

  if (!view || !draft) {
    return <div className="rounded-xl surface-1 p-6 space-y-3" aria-busy="true"><Skeleton className="h-4 w-40" /><Skeleton className="h-9 w-full max-w-md" /></div>;
  }

  const info = providerInfo(draft.provider);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const needsToken = draft.access.enabled && !view.binding?.accessSecretPrefix && !(draft.access.clientId && draft.access.clientSecret);
  const saveBlocked = !draft.targetRef ? `Choose a ${info?.targetNoun ?? "target"}` : needsToken ? "Enter the Access client ID and secret" : null;

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMessage(null);
    const access = draft.access.enabled
      ? draft.access.clientId && draft.access.clientSecret ? { clientId: draft.access.clientId, clientSecret: draft.access.clientSecret } : undefined
      : view?.binding?.accessSecretPrefix ? null : undefined;
    try {
      await sendJson(base, "PUT", {
        provider: draft.provider,
        targetRef: draft.targetRef,
        allowedHostSuffixes: draft.hosts.split(",").map((h) => h.trim()).filter(Boolean),
        ...(access !== undefined ? { access } : {}),
      });
      await load();
      setMessage({ ok: true, text: "Saved. New PR commits will wait for their preview." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Could not save") });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    try {
      await sendJson(base, "DELETE");
      await load();
      setMessage({ ok: true, text: "Removed. PRs test the default environment again." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Could not remove") });
    }
  }

  async function importEnvironments() {
    setBusy("import");
    setMessage(null);
    try {
      const r = await sendJson<{ created: number; updated: number }>(`${base}/import-environments`, "POST");
      setMessage({ ok: true, text: `Imported: ${r.created} created, ${r.updated} updated. Reload to see them above.` });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Import failed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl surface-1 p-6 space-y-4" aria-labelledby={`${id}-title`}>
      <div>
        <h3 id={`${id}-title`} className="text-sm font-medium text-foreground text-balance">Preview source</h3>
        <p className="text-xs text-muted-foreground text-pretty mt-0.5">
          With a preview source, each PR is tested on its own preview deployment instead of the default environment.
        </p>
      </div>

      {view.connections.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">Connect Railway or Cloudflare Pages first.</p>
          <Button size="sm" variant="outline" onClick={onOpenIntegrations}>Open Integrations</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-provider`} className="text-xs text-muted-foreground">Provider</Label>
              <Select value={draft.provider} onValueChange={(p) => set({ provider: p, targetRef: "", hosts: (providerInfo(p)?.defaultHostSuffixes ?? []).join(", ") })}>
                <SelectTrigger id={`${id}-provider`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PREVIEW_PROVIDER_CATALOG.filter((p) => view.connections.some((c) => c.provider === p.id)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-target`} className="text-xs text-muted-foreground">{info?.targetNoun ?? "Target"}</Label>
              <Select value={draft.targetRef} onValueChange={(targetRef) => set({ targetRef })} disabled={!targets}>
                <SelectTrigger id={`${id}-target`} aria-busy={!targets}>
                  <SelectValue placeholder={!targets ? "Loading…" : targets.length ? "Choose one" : "None found for this token"} />
                </SelectTrigger>
                <SelectContent>
                  {(targets ?? []).map((t) => <SelectItem key={t.ref} value={t.ref}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-hosts`} className="text-xs text-muted-foreground">Allowed preview hosts</Label>
            <Input id={`${id}-hosts`} value={draft.hosts} onChange={(e) => set({ hosts: e.target.value })}
              aria-describedby={`${id}-hosts-help`} className="bg-muted/40 font-mono max-w-md" />
            <p id={`${id}-hosts-help`} className="text-xs text-muted-foreground text-pretty">
              Comma-separated domain suffixes. Orbit only tests (and sends project secrets to) https previews on these hosts.
            </p>
          </div>

          <PreviewAccessFields projectId={projectId} draft={draft.access} onChange={(access) => set({ access })}
            hasStoredToken={!!view.binding?.accessSecretPrefix} canTest={!!view.binding}
            sampleUrl={view.deployments.find((d) => d.url)?.url ?? null} />

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={!!busy || !!saveBlocked} aria-busy={busy === "save"}
              className="bg-orbit-accent hover:bg-orbit-accent/90 text-white">
              {busy === "save" ? "Saving…" : "Save preview source"}
            </Button>
            {view.binding?.connection.provider === "railway" && (
              <Button size="sm" variant="outline" onClick={importEnvironments} disabled={!!busy} aria-busy={busy === "import"}>
                {busy === "import" ? "Importing…" : "Import Railway environments"}
              </Button>
            )}
            {view.binding && (
              <ConfirmDialog trigger={<Button size="sm" variant="outline">Remove</Button>}
                title="Remove the preview source?" confirmLabel="Remove" onConfirm={remove}
                description="PRs go back to testing the default environment, and this project's preview history is deleted." />
            )}
            {saveBlocked && !busy && <span className="text-xs text-muted-foreground">{saveBlocked} to save</span>}
          </div>
        </div>
      )}
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-orbit-pass" : "text-xs text-red-400"}>{message.text}</p>}

      {view.binding && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-medium text-foreground">Recent PR previews</h4>
          <PreviewDeploymentsList rows={view.deployments} />
        </div>
      )}
    </section>
  );
}
