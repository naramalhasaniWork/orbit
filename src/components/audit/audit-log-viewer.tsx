"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Download, RefreshCw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuditFilterBar } from "./audit-filter-bar";
import { AuditLogRow } from "./audit-log-row";
import { AuditPaginationControls } from "./audit-pagination";
import type {
  AuditLogEntry,
  AuditPagination,
  AuditFilters,
  WorkspaceMemberOption,
} from "./audit-types";

interface AuditLogViewerProps {
  /** Workspace ID for scoped view, omit for admin global view */
  workspaceId?: string;
  /** Show workspace column (admin view) */
  showWorkspace?: boolean;
}

const EMPTY_FILTERS: AuditFilters = {
  action: "",
  userId: "",
  resourceType: "",
  from: "",
  to: "",
  search: "",
};

const POLL_INTERVAL = 30_000;

export function AuditLogViewer({ workspaceId, showWorkspace }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<AuditPagination>({
    page: 1, limit: 50, total: 0, totalPages: 0,
  });
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiBase = workspaceId
    ? `/api/workspaces/${workspaceId}/audit-logs`
    : "/api/admin/audit-logs";

  const fetchLogs = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (filters.action) params.set("action", filters.action);
        if (filters.userId) params.set("userId", filters.userId);
        if (filters.resourceType) params.set("resourceType", filters.resourceType);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.search) params.set("search", filters.search);

        const res = await fetch(`${apiBase}?${params}`);
        const json = await res.json();

        if (json.success) {
          setLogs(json.data.logs);
          setPagination(json.data.pagination);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiBase, filters]
  );

  // Fetch workspace members for the user filter dropdown
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setMembers(
            json.data.map((m: { userId: string; user: { name: string | null; email: string } }) => ({
              id: m.userId,
              name: m.user.name,
              email: m.user.email,
            }))
          );
        }
      })
      .catch(() => {});
  }, [workspaceId]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  // Poll every 30s
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      fetchLogs(pagination.page);
    }, POLL_INTERVAL);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [fetchLogs, pagination.page]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: "csv" });
      if (filters.action) params.set("action", filters.action);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.resourceType) params.set("resourceType", filters.resourceType);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.search) params.set("search", filters.search);

      const res = await fetch(`${apiBase}?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") ?? "audit-logs.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <AuditFilterBar
          filters={filters}
          members={members}
          onFilterChange={(f) => {
            setFilters(f);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        />

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchLogs(pagination.page)}
            disabled={loading}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={handleExportCsv}
            disabled={exporting || pagination.total === 0}
            className={cn(
              "flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors",
              "bg-orbit-accent/15 text-orbit-accent hover:bg-orbit-accent/25",
              (exporting || pagination.total === 0) && "opacity-50 cursor-not-allowed"
            )}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="surface-2 border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                {showWorkspace && (
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Workspace</th>
                )}
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">User</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Resource</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">IP Address</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={showWorkspace ? 7 : 6} className="py-16 text-center">
                    <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading audit logs...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={showWorkspace ? 7 : 6} className="py-16 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No audit logs found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Activity will appear here as actions are performed.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <AuditLogRow key={log.id} log={log} showWorkspace={showWorkspace} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <AuditPaginationControls
          pagination={pagination}
          onPageChange={(page) => {
            setPagination((p) => ({ ...p, page }));
            fetchLogs(page);
          }}
        />
      )}
    </div>
  );
}
