"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type RunListItem,
  RUN_STATUS_CONFIG,
  MODE_LABELS,
  TRIGGER_LABELS,
} from "@/components/runs/run-types";

interface Filters {
  status: string | null;
  mode: string | null;
  trigger: string | null;
}

interface RunsFilterProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  runs: RunListItem[];
}

export function RunsFilter({ filters, onFiltersChange, runs }: RunsFilterProps) {
  const availableStatuses = useMemo(
    () => Array.from(new Set(runs.map((r) => r.status))),
    [runs]
  );
  const availableModes = useMemo(
    () => Array.from(new Set(runs.map((r) => r.mode))),
    [runs]
  );
  const availableTriggers = useMemo(
    () => Array.from(new Set(runs.map((r) => r.trigger))),
    [runs]
  );

  const hasActiveFilters = filters.status || filters.mode || filters.trigger;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground">Filter:</span>

      <FilterGroup
        label="Status"
        options={availableStatuses.map((s) => ({
          value: s,
          label: RUN_STATUS_CONFIG[s]?.label ?? s,
        }))}
        selected={filters.status}
        onSelect={(v) => onFiltersChange({ ...filters, status: v })}
      />

      <FilterGroup
        label="Mode"
        options={availableModes.map((m) => ({
          value: m,
          label: MODE_LABELS[m] ?? m,
        }))}
        selected={filters.mode}
        onSelect={(v) => onFiltersChange({ ...filters, mode: v })}
      />

      <FilterGroup
        label="Trigger"
        options={availableTriggers.map((t) => ({
          value: t,
          label: TRIGGER_LABELS[t] ?? t,
        }))}
        selected={filters.trigger}
        onSelect={(v) => onFiltersChange({ ...filters, trigger: v })}
      />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-7 px-2"
          onClick={() => onFiltersChange({ status: null, mode: null, trigger: null })}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(selected === opt.value ? null : opt.value)}
          className={cn(
            "text-xs px-2 py-1 rounded-md transition-colors",
            selected === opt.value
              ? "bg-orbit-accent/15 text-orbit-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
