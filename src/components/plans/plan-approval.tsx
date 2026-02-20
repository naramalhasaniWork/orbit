"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanApprovalProps {
  projectId: string;
  planId: string;
  approval?: {
    status: string;
    approvedBy: string;
    approvedAt: string;
    notes: string | null;
  } | null;
  onApproved: () => void;
}

export function PlanApproval({
  projectId,
  planId,
  approval,
  onApproved,
}: PlanApprovalProps) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  if (approval?.status === "approved") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orbit-pass/10 border border-orbit-pass/20">
        <CheckCircle2 className="h-3.5 w-3.5 text-orbit-pass shrink-0" />
        <span className="text-xs text-orbit-pass">
          Approved by {approval.approvedBy}
        </span>
        {approval.notes && (
          <span className="text-xs text-muted-foreground ml-2">
            {approval.notes}
          </span>
        )}
      </div>
    );
  }

  if (approval?.status === "rejected") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orbit-fail/10 border border-orbit-fail/20">
        <XCircle className="h-3.5 w-3.5 text-orbit-fail shrink-0" />
        <span className="text-xs text-orbit-fail">
          Rejected by {approval.approvedBy}
        </span>
        {approval.notes && (
          <span className="text-xs text-muted-foreground ml-2">
            {approval.notes}
          </span>
        )}
      </div>
    );
  }

  async function handleAction(action: "approve" | "reject") {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, action, notes: notes.trim() || undefined }),
      });

      if (res.ok) {
        onApproved();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-orbit-flaky/20 bg-orbit-flaky/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-orbit-flaky" />
        <span className="text-xs font-medium text-foreground">
          Approval Required
        </span>
        <span className="text-xs text-muted-foreground">
          This plan requires approval before execution
        </span>
      </div>

      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes..."
          className={cn(
            "w-full rounded-md bg-white/[0.04] border border-transparent px-3 py-2",
            "text-xs text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-1 focus:ring-orbit-accent resize-y"
          )}
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 bg-orbit-pass hover:bg-orbit-pass/90 text-white gap-1.5 text-xs"
          onClick={() => handleAction("approve")}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-orbit-fail/30 text-orbit-fail hover:bg-orbit-fail/10 gap-1.5 text-xs"
          onClick={() => handleAction("reject")}
          disabled={loading}
        >
          <XCircle className="h-3 w-3" />
          Reject
        </Button>
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="text-xs text-muted-foreground hover:text-foreground ml-2"
        >
          {showNotes ? "Hide notes" : "Add notes"}
        </button>
      </div>
    </div>
  );
}
