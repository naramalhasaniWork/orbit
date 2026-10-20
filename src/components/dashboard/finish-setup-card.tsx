"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FinishSetupStep } from "@/lib/setup/finish-setup";

export function FinishSetupCard({
  workspaceId,
  steps,
}: {
  workspaceId: string;
  steps: FinishSetupStep[];
}) {
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/finish-setup`, { method: "POST" });
    if (res.ok) setDismissed(true);
    else setError("Could not dismiss. Try again.");
  }

  if (dismissed) return null;

  return (
    <div className="rounded-xl surface-1 p-5 mb-6 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Finish setting up Orbit</h2>
          <p className="text-xs text-muted-foreground mt-0.5">You&apos;re the admin of this instance. A few things are left.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex gap-3">
            {step.done ? (
              <Check className="h-4 w-4 mt-0.5 text-orbit-pass shrink-0" />
            ) : (
              <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <div>
              <div className="text-sm text-foreground">
                {step.href ? (
                  <Link href={step.href} className="hover:underline">
                    {step.title}
                  </Link>
                ) : (
                  step.title
                )}
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-orbit-fail">{error}</p>}
    </div>
  );
}
