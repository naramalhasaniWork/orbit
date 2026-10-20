"use client";

import { useCallback, useState } from "react";
import { RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { assertOk, runBulk, summarizeBulk } from "@/lib/bulk";
import { CANCELLABLE_RUN_STATUSES } from "@/lib/runs/run-list";
import type { RunListItem } from "@/components/runs/run-types";

interface RunsBulkActionsProps {
  projectId: string;
  /** The selected runs, in display order. */
  runs: RunListItem[];
  onClear: () => void;
  /** Called after any action so the list can refetch. */
  onDone: () => void;
}

/** Cancel / re-run the selected runs through the existing single-run endpoints. */
export function RunsBulkActions({ projectId, runs, onClear, onDone }: RunsBulkActionsProps) {
  const [busy, setBusy] = useState<"cancel" | "rerun" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cancellable = runs.filter((r) => CANCELLABLE_RUN_STATUSES.has(r.status));

  const cancelSelected = useCallback(async () => {
    setBusy("cancel");
    setMessage(null);
    const result = await runBulk(
      cancellable.map((r) => r.id),
      async (id) =>
        assertOk(
          await fetch(`/api/projects/${projectId}/runs/${id}/cancel`, { method: "POST" }),
          "Couldn't cancel"
        )
    );
    setMessage(summarizeBulk("Cancelled", result));
    setBusy(null);
    onDone();
  }, [cancellable, projectId, onDone]);

  const rerunSelected = useCallback(async () => {
    setBusy("rerun");
    setMessage(null);
    const byId = new Map(runs.map((r) => [r.id, r]));
    // One at a time: each start checks plan limits and credits, so a burst would race them.
    const result = await runBulk(
      runs.map((r) => r.id),
      async (id) => {
        const run = byId.get(id);
        if (!run) return;
        await assertOk(
          await fetch(`/api/projects/${projectId}/runs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: run.mode,
              branch: run.branch ?? undefined,
              commitSha: run.commitSha ?? undefined,
              prNumber: run.prNumber ?? undefined,
            }),
          }),
          "Couldn't start"
        );
      },
      1
    );
    setMessage(summarizeBulk("Started", result));
    setBusy(null);
    onDone();
  }, [runs, projectId, onDone]);

  return (
    <BulkActionBar
      count={runs.length}
      noun="runs"
      busy={busy !== null}
      message={message}
      onClear={() => {
        setMessage(null);
        onClear();
      }}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        disabled={busy !== null || cancellable.length === 0}
        title={cancellable.length === 0 ? "None of the selected runs are in progress." : undefined}
        onClick={cancelSelected}
      >
        <XCircle className="h-3 w-3" />
        Cancel{cancellable.length > 0 ? ` (${cancellable.length})` : ""}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        disabled={busy !== null}
        onClick={rerunSelected}
      >
        <RotateCcw className="h-3 w-3" />
        Re-run ({runs.length})
      </Button>
    </BulkActionBar>
  );
}
