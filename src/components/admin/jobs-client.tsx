"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/admin/data-table";
import { RotateCw, Trash2 } from "lucide-react";

type FailureStatus = "open" | "retried" | "discarded";

export interface JobFailureEntry {
  id: string;
  queue: string;
  jobId: string;
  jobName: string;
  error: string;
  attemptsMade: number;
  runId: string | null;
  projectId: string | null;
  status: FailureStatus;
  createdAt: string;
}

interface JobsClientProps {
  initialFailures: JobFailureEntry[];
  initialTotal: number;
}

const LIMIT = 50;

export function JobsClient({ initialFailures, initialTotal }: JobsClientProps) {
  const [failures, setFailures] = useState(initialFailures);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FailureStatus>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (p: number, s: FailureStatus) => {
    const res = await fetch(`/api/admin/jobs?status=${s}&page=${p}&limit=${LIMIT}`);
    const json = await res.json();
    if (json.success) {
      setFailures(json.data.failures);
      setTotal(json.data.total);
    }
  }, []);

  async function act(row: JobFailureEntry, action: "retry" | "discard") {
    setBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/jobs/${row.id}/${action}`, { method: "POST" });
      const json = await res.json();
      setMessage(json.success ? `${action === "retry" ? "Re-queued" : "Discarded"} ${row.queue}:${row.jobId}` : `Error: ${json.error?.message ?? "Unknown error"}`);
      await load(page, status);
    } catch {
      setMessage(`Failed to ${action} job`);
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    {
      key: "job", header: "Job",
      render: (row: JobFailureEntry) => (
        <div>
          <span className="text-sm font-medium text-foreground capitalize">{row.queue}</span>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">{row.jobId}</p>
        </div>
      ),
    },
    {
      key: "error", header: "Error",
      render: (row: JobFailureEntry) => (
        <p className="text-xs text-muted-foreground max-w-md line-clamp-2" title={row.error}>{row.error}</p>
      ),
    },
    {
      key: "attempts", header: "Attempts",
      render: (row: JobFailureEntry) => <span className="text-xs text-muted-foreground">{row.attemptsMade}</span>,
    },
    {
      key: "failed", header: "Failed",
      render: (row: JobFailureEntry) => <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions", header: "",
      render: (row: JobFailureEntry) =>
        row.status === "open" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => act(row, "retry")}>
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />Retry
            </Button>
            <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => act(row, "discard")}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Discard
            </Button>
          </div>
        ) : (
          <Badge variant="secondary">{row.status}</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-foreground">Dead-letter Jobs</h2>
          <p className="text-sm text-muted-foreground">Jobs that exhausted their retries. Retry re-queues the job; Discard closes it.</p>
        </div>
        <Select value={status} onValueChange={(v) => { const s = v as FailureStatus; setStatus(s); setPage(1); load(1, s); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="retried">Retried</SelectItem>
            <SelectItem value="discarded">Discarded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {message && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm text-muted-foreground">{message}</div>
      )}

      <DataTable columns={columns} data={failures} total={total} page={page} limit={LIMIT} onPageChange={(p) => { setPage(p); load(p, status); }} />
    </div>
  );
}
