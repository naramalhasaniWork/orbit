"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { assertOk, runBulk, summarizeBulk } from "@/lib/bulk";
import type { TestCaseData } from "@/components/plans/plan-types";

interface PlanBulkActionsProps {
  projectId: string;
  /** The selected test cases. */
  testCases: TestCaseData[];
  onClear: () => void;
  onDone: () => void;
}

/** Approve (enable) or skip (disable) the selected test cases via the single test-case PATCH. */
export function PlanBulkActions({ projectId, testCases, onClear, onDone }: PlanBulkActionsProps) {
  const [busy, setBusy] = useState<"approve" | "skip" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const toApprove = testCases.filter((tc) => !tc.isEnabled);
  const toSkip = testCases.filter((tc) => tc.isEnabled);

  const apply = useCallback(
    async (kind: "approve" | "skip", targets: TestCaseData[]) => {
      setBusy(kind);
      setMessage(null);
      const result = await runBulk(
        targets.map((tc) => tc.id),
        async (id) =>
          assertOk(
            await fetch(`/api/projects/${projectId}/test-cases/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isEnabled: kind === "approve" }),
            }),
            "Couldn't update"
          ),
        4
      );
      setMessage(summarizeBulk(kind === "approve" ? "Approved" : "Skipped", result));
      setBusy(null);
      onDone();
    },
    [projectId, onDone]
  );

  return (
    <BulkActionBar
      count={testCases.length}
      noun="test cases"
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
        disabled={busy !== null || toApprove.length === 0}
        title="Include the selected test cases in runs"
        onClick={() => apply("approve", toApprove)}
      >
        <CheckCircle2 className="h-3 w-3" />
        Approve{toApprove.length > 0 ? ` (${toApprove.length})` : ""}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        disabled={busy !== null || toSkip.length === 0}
        title="Leave the selected test cases out of runs"
        onClick={() => apply("skip", toSkip)}
      >
        <SkipForward className="h-3 w-3" />
        Skip{toSkip.length > 0 ? ` (${toSkip.length})` : ""}
      </Button>
    </BulkActionBar>
  );
}
