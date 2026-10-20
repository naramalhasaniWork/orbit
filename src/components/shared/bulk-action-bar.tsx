"use client";

import { Button } from "@/components/ui/button";

interface BulkActionBarProps {
  count: number;
  /** Plural noun, e.g. "runs". */
  noun: string;
  busy?: boolean;
  /** Outcome of the last bulk action. */
  message?: string | null;
  onClear: () => void;
  children: React.ReactNode;
}

/** Appears while rows are selected; actions are passed as children. */
export function BulkActionBar({ count, noun, busy, message, onClear, children }: BulkActionBarProps) {
  if (count === 0 && !message) return null;

  return (
    <div
      role="region"
      aria-label={`Bulk actions for ${noun}`}
      className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-sticky flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-elevated"
    >
      {count > 0 && (
        <>
          <span className="text-xs font-medium text-foreground tabular-nums">
            {count} {count === 1 ? noun.replace(/s$/, "") : noun} selected
          </span>
          <div className="flex items-center gap-2">{children}</div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear} disabled={busy}>
            Clear
          </Button>
        </>
      )}
      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}
    </div>
  );
}
