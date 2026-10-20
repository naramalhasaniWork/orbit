"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GITHUB_APP_PERMISSIONS, type GitHubAppSettings } from "@/lib/setup/github-app";
import type { SetupCheck } from "@/lib/setup/checks";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <code className="flex-1 text-sm font-mono bg-white/[0.04] rounded-md px-3 py-2 break-all">{value}</code>
        <Button type="button" size="sm" variant="outline" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export function SetupChecklist({ checks, github }: { checks: SetupCheck[]; github: GitHubAppSettings }) {
  const router = useRouter();
  const allPassing = checks.every((c) => c.ok);
  const groups = Array.from(new Set(checks.map((c) => c.group)));

  return (
    <div className="min-h-dvh surface-0 p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Set up Orbit</h1>
          <p className="text-sm text-muted-foreground">
            This page is only available until the first person signs in. Fix anything marked red,
            then sign in with GitHub: the first account becomes the admin.
          </p>
        </div>

        {groups.map((group) => (
          <section key={group} className="rounded-xl surface-1 p-5 space-y-3">
            <h2 className="text-sm font-medium text-foreground">{group}</h2>
            <ul className="space-y-3">
              {checks
                .filter((c) => c.group === group)
                .map((c) => (
                  <li key={c.id} className="flex gap-3">
                    {c.ok ? (
                      <Check className="h-4 w-4 mt-0.5 text-orbit-pass shrink-0" />
                    ) : (
                      <X className="h-4 w-4 mt-0.5 text-orbit-fail shrink-0" />
                    )}
                    <div>
                      <div className={cn("text-sm", c.ok ? "text-foreground" : "text-orbit-fail")}>{c.label}</div>
                      {c.fix && <p className="text-xs text-muted-foreground mt-0.5">{c.fix}</p>}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <section className="rounded-xl surface-1 p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">GitHub App settings</h2>
          <p className="text-xs text-muted-foreground">
            Create the app at github.com/settings/apps/new (or under your organization), paste these
            values, or let Orbit pre-fill them:
          </p>
          <Button asChild size="sm" variant="outline">
            <a href="/api/setup/github-app/start">Create GitHub App for me</a>
          </Button>
          <CopyField label="Homepage URL" value={github.baseUrl} />
          <CopyField label="Callback URL" value={github.callbackUrl} />
          <CopyField label="Setup URL (post installation)" value={github.setupUrl} />
          <CopyField label="Webhook URL" value={github.webhookUrl} />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Tick <strong className="text-foreground">Request user authorization (OAuth) during installation</strong> and{" "}
              <strong className="text-foreground">Redirect on update</strong>.
            </p>
            <p>Permissions:</p>
            <ul className="list-disc pl-5">
              {GITHUB_APP_PERMISSIONS.map((p) => (
                <li key={p.key}>
                  {p.name}: {p.level === "write" ? "Read and write" : "Read-only"}
                </li>
              ))}
            </ul>
            <p>Subscribe to events: Installation, Pull request, Push, Issue comment.</p>
          </div>
        </section>

        <div className="flex items-center gap-3">
          {allPassing ? (
            <Button asChild className="bg-orbit-accent hover:bg-orbit-accent/90 text-white">
              <a href="/login">Sign in with GitHub: you&apos;ll become the admin</a>
            </Button>
          ) : (
            <Button type="button" variant="outline" className="gap-2" onClick={() => router.refresh()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-run checks
            </Button>
          )}
          {!allPassing && (
            <a href="/login" className="text-xs text-muted-foreground hover:text-foreground">
              Sign in anyway
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
