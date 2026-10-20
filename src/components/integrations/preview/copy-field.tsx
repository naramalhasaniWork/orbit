"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A read-only value with a labelled copy button and a polite "Copied" announcement. */
export function CopyField({ label, value, help }: { label: string; value: string; help?: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 max-w-xl">
        <Input
          id={id}
          readOnly
          value={value}
          aria-describedby={help ? `${id}-help` : undefined}
          className="bg-muted/40 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="size-3.5 text-orbit-pass" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
        <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
      </div>
      {help && <p id={`${id}-help`} className="text-xs text-muted-foreground text-pretty">{help}</p>}
    </div>
  );
}
