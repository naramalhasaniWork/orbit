"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditFilters, WorkspaceMemberOption } from "./audit-types";
import { ACTION_OPTIONS, RESOURCE_TYPES } from "./audit-types";

interface AuditFilterBarProps {
  filters: AuditFilters;
  members: WorkspaceMemberOption[];
  onFilterChange: (filters: AuditFilters) => void;
}

export function AuditFilterBar({ filters, members, onFilterChange }: AuditFilterBarProps) {
  const update = (key: keyof AuditFilters, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Action filter */}
      <select
        value={filters.action}
        onChange={(e) => update("action", e.target.value)}
        className={cn(
          "h-8 rounded-md border border-border bg-foreground/[0.03] px-2 text-xs text-foreground",
          "focus:outline-none focus:ring-1 focus-visible:ring-ring",
          filters.action && "border-tm-line-strong"
        )}
      >
        <option value="">All Actions</option>
        {ACTION_OPTIONS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>

      {/* User filter */}
      <select
        value={filters.userId}
        onChange={(e) => update("userId", e.target.value)}
        className={cn(
          "h-8 rounded-md border border-border bg-foreground/[0.03] px-2 text-xs text-foreground",
          "focus:outline-none focus:ring-1 focus-visible:ring-ring",
          filters.userId && "border-tm-line-strong"
        )}
      >
        <option value="">All Users</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name ?? m.email}
          </option>
        ))}
      </select>

      {/* Resource type filter */}
      <select
        value={filters.resourceType}
        onChange={(e) => update("resourceType", e.target.value)}
        className={cn(
          "h-8 rounded-md border border-border bg-foreground/[0.03] px-2 text-xs text-foreground",
          "focus:outline-none focus:ring-1 focus-visible:ring-ring",
          filters.resourceType && "border-tm-line-strong"
        )}
      >
        <option value="">All Resources</option>
        {RESOURCE_TYPES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Date from */}
      <input
        type="date"
        value={filters.from}
        onChange={(e) => update("from", e.target.value)}
        placeholder="From"
        className={cn(
          "h-8 rounded-md border border-border bg-foreground/[0.03] px-2 text-xs text-foreground",
          "focus:outline-none focus:ring-1 focus-visible:ring-ring",
          filters.from && "border-tm-line-strong"
        )}
      />

      {/* Date to */}
      <input
        type="date"
        value={filters.to}
        onChange={(e) => update("to", e.target.value)}
        placeholder="To"
        className={cn(
          "h-8 rounded-md border border-border bg-foreground/[0.03] px-2 text-xs text-foreground",
          "focus:outline-none focus:ring-1 focus-visible:ring-ring",
          filters.to && "border-tm-line-strong"
        )}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
          placeholder="Search metadata..."
          className={cn(
            "h-8 w-44 rounded-md border border-border bg-foreground/[0.03] pl-7 pr-2 text-xs text-foreground",
            "focus:outline-none focus:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground",
            filters.search && "border-tm-line-strong"
          )}
        />
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={() =>
            onFilterChange({ action: "", userId: "", resourceType: "", from: "", to: "", search: "" })
          }
          className="flex items-center gap-1 h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
