"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectCheckbox } from "@/components/shared/select-checkbox";
import { cn } from "@/lib/utils";
import { TEST_TYPE_CONFIG } from "@/components/plans/plan-types";
import {
  SHOW_OPTIONS,
  hasActiveTestCaseFilters,
  type TestCaseFilters,
} from "@/lib/plans/test-case-filter";

interface PlanTestFiltersProps {
  filters: TestCaseFilters;
  onChange: (next: Partial<TestCaseFilters>) => void;
  types: string[];
  shownCount: number;
  totalCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
}

export function PlanTestFilters({
  filters,
  onChange,
  types,
  shownCount,
  totalCount,
  allSelected,
  onToggleAll,
}: PlanTestFiltersProps) {
  // Type freely, write to the URL once typing pauses.
  const [text, setText] = useState(filters.q);
  useEffect(() => setText(filters.q), [filters.q]);
  useEffect(() => {
    if (text === filters.q) return;
    const t = setTimeout(() => onChange({ q: text }), 250);
    return () => clearTimeout(t);
  }, [text, filters.q, onChange]);

  const active = hasActiveTestCaseFilters(filters);

  return (
    <div className="px-5 pb-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <SelectCheckbox
          checked={allSelected}
          onToggle={onToggleAll}
          label="Select all visible test cases"
        />
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter test cases..."
            aria-label="Filter test cases"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          {Object.entries(SHOW_OPTIONS).map(([value, label]) => (
            <Chip
              key={value}
              selected={(filters.show || "all") === value}
              onClick={() => onChange({ show: value })}
            >
              {label}
            </Chip>
          ))}
        </div>
        {types.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {types.map((t) => (
              <Chip
                key={t}
                selected={filters.type === t}
                onClick={() => onChange({ type: filters.type === t ? "" : t })}
              >
                {TEST_TYPE_CONFIG[t]?.label ?? t}
              </Chip>
            ))}
          </div>
        )}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onChange({ q: "", type: "", show: "" })}
          >
            Clear
          </Button>
        )}
      </div>
      {active && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          Showing {shownCount} of {totalCount} test cases
        </p>
      )}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "text-xs px-2 py-1 rounded-md transition-colors",
        selected
          ? "bg-foreground/[0.06] text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
      )}
    >
      {children}
    </button>
  );
}
