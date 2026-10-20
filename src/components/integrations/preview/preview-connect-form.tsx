"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PreviewProviderInfo } from "@/services/preview/catalog";

interface PreviewConnectFormProps {
  info: PreviewProviderInfo;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

/** Labelled credential fields from the provider catalog; the server error sits under the button. */
export function PreviewConnectForm({ info, busy, error, submitLabel, onSubmit, onCancel }: PreviewConnectFormProps) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const missing = info.fields.filter((f) => !values[f.name]?.trim());
  const errorId = `${formId}-error`;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (missing.length === 0) onSubmit(values);
      }}
      aria-describedby={error ? errorId : undefined}
    >
      {info.fields.map((field) => {
        const id = `${formId}-${field.name}`;
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id} className="text-xs text-muted-foreground">{field.label}</Label>
            <Input
              id={id}
              type={field.type}
              autoComplete="off"
              spellCheck={false}
              placeholder={field.placeholder}
              value={values[field.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              aria-describedby={`${id}-help${error ? ` ${errorId}` : ""}`}
              aria-invalid={!!error}
              className="bg-muted/40 font-mono max-w-md"
            />
            <p id={`${id}-help`} className="text-xs text-muted-foreground text-pretty">{field.help}</p>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || missing.length > 0}
          aria-busy={busy}
          className="bg-orbit-accent hover:bg-orbit-accent/90 text-white"
        >
          {busy ? "Checking…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
        {missing.length > 0 && !busy && (
          <span className="text-xs text-muted-foreground">Enter {missing.map((f) => f.label.toLowerCase()).join(" and ")} to continue</span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-400 text-pretty">{error}</p>
      )}
    </form>
  );
}
