"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";
import {
  Route,
  Component,
  Server,
  Database,
  Shield,
  Layers,
  X,
} from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type CoverageLevel = "covered" | "partial" | "uncovered" | "excluded";

interface CoverageCell {
  nodeId: string;
  name: string;
  type: string;
  filePath: string;
  coverage: CoverageLevel;
  testCount: number;
  passCount: number;
  failCount: number;
  testCases?: { id: string; name: string; verdict: string | null }[];
}

interface CoverageMapProps {
  cells: CoverageCell[];
  className?: string;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const coverageColors: Record<CoverageLevel, string> = {
  covered: "bg-orbit-pass/20 border-orbit-pass/30 hover:bg-orbit-pass/30",
  partial: "bg-orbit-flaky/20 border-orbit-flaky/30 hover:bg-orbit-flaky/30",
  uncovered: "bg-orbit-fail/20 border-orbit-fail/30 hover:bg-orbit-fail/30",
  excluded: "bg-muted/20 border-white/[0.04] hover:bg-muted/30",
};

const coverageDotStatus: Record<CoverageLevel, "pass" | "fail" | "flaky" | "untested"> = {
  covered: "pass",
  partial: "flaky",
  uncovered: "fail",
  excluded: "untested",
};

const coverageLabels: Record<CoverageLevel, string> = {
  covered: "Covered",
  partial: "Partial",
  uncovered: "Uncovered",
  excluded: "Excluded",
};

const typeIcons: Record<string, React.ElementType> = {
  route: Route,
  component: Component,
  endpoint: Server,
  model: Database,
  auth_strategy: Shield,
  middleware: Layers,
};

const typeLabels: Record<string, string> = {
  route: "Routes",
  component: "Components",
  endpoint: "Endpoints",
  model: "Models",
  auth_strategy: "Auth",
  middleware: "Middleware",
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function CoverageMap({ cells, className }: CoverageMapProps) {
  const [selectedCell, setSelectedCell] = useState<CoverageCell | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, CoverageCell[]> = {};
    for (const cell of cells) {
      if (!map[cell.type]) map[cell.type] = [];
      map[cell.type].push(cell);
    }
    return map;
  }, [cells]);

  const filteredGroups = useMemo(() => {
    if (!filterType) return grouped;
    const group = grouped[filterType];
    if (!group) return {};
    return { [filterType]: group };
  }, [grouped, filterType]);

  const summary = useMemo(() => {
    const counts: Record<CoverageLevel, number> = {
      covered: 0,
      partial: 0,
      uncovered: 0,
      excluded: 0,
    };
    for (const cell of cells) {
      counts[cell.coverage]++;
    }
    return counts;
  }, [cells]);

  return (
    <div className={cn("flex gap-4", className)}>
      {/* Main grid */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Legend + filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(Object.keys(coverageLabels) as CoverageLevel[]).map((level) => (
              <div key={level} className="flex items-center gap-1.5">
                <StatusDot status={coverageDotStatus[level]} />
                <span className="text-[11px] text-muted-foreground">
                  {coverageLabels[level]} ({summary[level]})
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterType(null)}
              className={cn(
                "px-2 py-1 rounded text-[11px] transition-colors",
                !filterType
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {Object.keys(grouped).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? null : type)}
                className={cn(
                  "px-2 py-1 rounded text-[11px] transition-colors",
                  filterType === type
                    ? "bg-white/[0.08] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {typeLabels[type] ?? type}
              </button>
            ))}
          </div>
        </div>

        {/* Grid sections */}
        <div className="space-y-5">
          {Object.entries(filteredGroups).map(([type, groupCells]) => {
            const TypeIcon = typeIcons[type] ?? Layers;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">
                    {typeLabels[type] ?? type}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    ({groupCells.length})
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                  {groupCells.map((cell) => (
                    <motion.button
                      key={cell.nodeId}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() =>
                        setSelectedCell(
                          selectedCell?.nodeId === cell.nodeId ? null : cell
                        )
                      }
                      className={cn(
                        "relative aspect-square rounded-md border p-1.5 transition-colors",
                        "flex flex-col items-center justify-center gap-0.5",
                        coverageColors[cell.coverage],
                        selectedCell?.nodeId === cell.nodeId &&
                          "ring-1 ring-orbit-accent"
                      )}
                      title={`${cell.name} — ${cell.coverage}`}
                    >
                      <span className="text-[9px] font-medium text-foreground truncate w-full text-center leading-tight">
                        {cell.name.length > 12
                          ? cell.name.slice(0, 11) + "..."
                          : cell.name}
                      </span>
                      {cell.testCount > 0 && (
                        <span className="text-[8px] text-muted-foreground tabular-nums">
                          {cell.testCount}
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedCell && (
          <motion.div
            initial={{ opacity: 0, x: 12, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 280 }}
            exit={{ opacity: 0, x: 12, width: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="shrink-0 overflow-hidden"
          >
            <div className="w-[280px] rounded-xl surface-1 border border-white/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate pr-2">
                  {selectedCell.name}
                </span>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {selectedCell.type}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Coverage</span>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={coverageDotStatus[selectedCell.coverage]} />
                    <span className="text-foreground">
                      {coverageLabels[selectedCell.coverage]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tests</span>
                  <span className="text-foreground tabular-nums">
                    {selectedCell.testCount}
                  </span>
                </div>
                {selectedCell.testCount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pass / Fail</span>
                    <span className="tabular-nums">
                      <span className="text-orbit-pass">
                        {selectedCell.passCount}
                      </span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-orbit-fail">
                        {selectedCell.failCount}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground truncate">
                {selectedCell.filePath}
              </p>

              {/* Test cases list */}
              {selectedCell.testCases && selectedCell.testCases.length > 0 && (
                <div className="border-t border-white/[0.04] pt-3">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Test Cases
                  </span>
                  <ScrollArea className="h-[200px] mt-2">
                    <div className="space-y-1">
                      {selectedCell.testCases.map((tc) => (
                        <div
                          key={tc.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
                        >
                          <StatusDot
                            status={
                              tc.verdict === "pass"
                                ? "pass"
                                : tc.verdict === "fail"
                                  ? "fail"
                                  : tc.verdict === "flaky"
                                    ? "flaky"
                                    : "untested"
                            }
                          />
                          <span className="text-xs text-foreground truncate">
                            {tc.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
