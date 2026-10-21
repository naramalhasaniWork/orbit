"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BugReportFilter, BugReportRow, BugReportStatus } from "@/server/data/bug-report-repo";
import { Avatar, StatusMark, firstLine, reporterName, shortAgo } from "./parts";
import { ReportPanel } from "./report-panel";

const FILTERS: Array<{ value: BugReportFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const EMPTY: Record<BugReportFilter, { title: string; action: { label: string; filter: BugReportFilter } }> = {
  open: { title: "No open reports. Nothing to triage.", action: { label: "Show resolved", filter: "resolved" } },
  resolved: { title: "Nothing resolved yet.", action: { label: "Show open", filter: "open" } },
  all: { title: "No reports yet. They arrive from “Report a bug” in the account menu.", action: { label: "Show open", filter: "open" } },
};

const GRID = "md:grid md:grid-cols-[minmax(0,180px)_minmax(0,140px)_minmax(0,1fr)_minmax(0,180px)_48px_88px] md:items-center md:gap-4";

interface ReportsClientProps {
  initialReports: BugReportRow[];
  initialSelectedId: string | null;
}

export function ReportsClient({ initialReports, initialSelectedId }: ReportsClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<BugReportFilter>("open");
  const [reports, setReports] = useState(initialReports);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BugReportRow | null>(
    initialReports.find((r) => r.id === initialSelectedId) ?? null
  );

  // A link from the notification email can point at a report outside the open list.
  useEffect(() => {
    if (!initialSelectedId || initialReports.some((r) => r.id === initialSelectedId)) return;
    fetch(`/api/admin/bug-reports/${encodeURIComponent(initialSelectedId)}`)
      .then((res) => res.json())
      .then((json) => json.success && setSelected(json.data.report))
      .catch(() => {});
  }, [initialSelectedId, initialReports]);

  async function load(next: BugReportFilter) {
    setFilter(next);
    setLoading(true);
    setLoadError(null);
    try {
      const json = await (await fetch(`/api/admin/bug-reports?status=${next}`)).json();
      if (!json.success) throw new Error(json.error?.message);
      setReports(json.data.reports);
    } catch {
      setLoadError("Couldn't load reports. Try again.");
    } finally {
      setLoading(false);
    }
  }

  /** Returns an error message, or null on success. The row stays put until the filter changes. */
  async function changeStatus(id: string, status: BugReportStatus): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/bug-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) return json.error?.message ?? "Couldn't update the report.";
      const updated: BugReportRow = json.data.report;
      setReports((rows) => rows.map((r) => (r.id === id ? updated : r)));
      setSelected(updated);
      router.refresh(); // the nav badge counts open reports on the server
      return null;
    } catch {
      return "Couldn't update the report.";
    }
  }

  const empty = EMPTY[filter];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-medium text-balance">Bug reports</h1>
          <p className="text-[13px] text-tm-t2">Sent from “Report a bug” in the app. Newest first.</p>
        </div>
        <div role="group" aria-label="Filter by status" className="inline-flex self-start rounded-md border border-border p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => load(f.value)}
              className={cn(
                "h-7 rounded px-3 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.value ? "bg-accent font-medium text-foreground" : "text-tm-t2 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p role="alert" className="text-[13px] text-tm-fail">
          {loadError}
        </p>
      )}

      <div aria-busy={loading} className={cn("overflow-hidden rounded-md border border-border bg-card", loading && "opacity-60")}>
        <div aria-hidden="true" className={cn("hidden border-b border-border px-4 py-2 text-tm-t3", GRID)}>
          {["Reporter", "Workspace", "Message", "Page", "When", "Status"].map((h) => (
            <span key={h} className="tm-label">{h}</span>
          ))}
        </div>

        {reports.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-[13px] text-tm-t2 text-pretty">{empty.title}</p>
            <Button variant="outline" size="sm" onClick={() => load(empty.action.filter)}>
              {empty.action.label}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setSelected(r)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none md:min-h-row md:py-1.5",
                    GRID,
                    selected?.id === r.id && "bg-accent"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar reporter={r.reporter} />
                    <span className="truncate font-medium">{reporterName(r.reporter)}</span>
                    <span className="tm-num ml-auto shrink-0 text-[11px] text-tm-t3 md:hidden">{shortAgo(r.createdAt)}</span>
                  </span>
                  <span className="hidden truncate text-tm-t2 md:block">{r.workspace?.name ?? "—"}</span>
                  <span className="line-clamp-2 min-w-0 text-tm-t1 md:truncate md:line-clamp-none">{firstLine(r.message)}</span>
                  <span className="tm-num hidden truncate text-[11px] text-tm-t2 md:block">{r.context.path ?? "—"}</span>
                  <time dateTime={r.createdAt} className="tm-num hidden text-[11px] text-tm-t3 md:block">
                    {shortAgo(r.createdAt)}
                  </time>
                  <StatusMark status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReportPanel report={selected} onOpenChange={(open) => !open && setSelected(null)} onStatusChange={changeStatus} />
    </div>
  );
}
