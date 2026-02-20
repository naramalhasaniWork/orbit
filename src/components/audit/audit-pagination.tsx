"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditPagination } from "./audit-types";

interface AuditPaginationControlsProps {
  pagination: AuditPagination;
  onPageChange: (page: number) => void;
}

export function AuditPaginationControls({
  pagination,
  onPageChange,
}: AuditPaginationControlsProps) {
  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-xs text-muted-foreground">
        {total > 0 ? (
          <>
            Showing <span className="text-foreground">{start}</span> to{" "}
            <span className="text-foreground">{end}</span> of{" "}
            <span className="text-foreground">{total.toLocaleString()}</span> entries
          </>
        ) : (
          "No audit logs found"
        )}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-md text-xs transition-colors",
            page <= 1
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {getPageNumbers(page, totalPages).map((p, i) =>
          p === -1 ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                "flex items-center justify-center h-7 min-w-[28px] rounded-md text-xs font-medium transition-colors",
                p === page
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-md text-xs transition-colors",
            page >= totalPages
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          )}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: number[] = [1];

  if (current > 3) pages.push(-1);

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push(-1);

  pages.push(total);
  return pages;
}
