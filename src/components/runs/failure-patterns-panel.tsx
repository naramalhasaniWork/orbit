"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Clock,
  Search,
  Shield,
  Wifi,
  Eye,
  Database,
  Navigation,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FailurePattern {
  id: string;
  pattern: string;
  category: string;
  occurrences: number;
  testCaseIds: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

interface CategorySummary {
  category: string;
  label: string;
  count: number;
  occurrences: number;
}

interface FailurePatternsPanelProps {
  projectId: string;
}

const CATEGORY_ICONS: Record<string, typeof AlertTriangle> = {
  timeout: Clock,
  selector_not_found: Search,
  assertion_mismatch: AlertTriangle,
  network_error: Wifi,
  auth_failure: Shield,
  render_error: Eye,
  data_inconsistency: Database,
  navigation_failure: Navigation,
  unknown: HelpCircle,
};

const CATEGORY_COLORS: Record<string, string> = {
  timeout: "text-orange-400",
  selector_not_found: "text-purple-400",
  assertion_mismatch: "text-orbit-fail",
  network_error: "text-red-400",
  auth_failure: "text-amber-400",
  render_error: "text-rose-400",
  data_inconsistency: "text-cyan-400",
  navigation_failure: "text-blue-400",
  unknown: "text-muted-foreground",
};

export function FailurePatternsPanel({ projectId }: FailurePatternsPanelProps) {
  const [patterns, setPatterns] = useState<FailurePattern[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/failure-patterns`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setPatterns(json.data?.patterns ?? []);
      setCategories(json.data?.byCategory ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  if (loading) {
    return (
      <div className="rounded-xl surface-1 p-5 animate-pulse">
        <div className="h-4 w-32 bg-muted/40 rounded" />
        <div className="mt-4 space-y-2">
          <div className="h-8 bg-muted/30 rounded" />
          <div className="h-8 bg-muted/30 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl surface-1 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 text-orbit-fail shrink-0" />
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t load failure patterns.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchPatterns}
            className="text-[11px] font-medium text-orbit-accent hover:text-orbit-accent/80 shrink-0"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (patterns.length === 0) return null;

  const filteredPatterns = selectedCategory
    ? patterns.filter((p) => p.category === selectedCategory)
    : patterns;

  return (
    <div className="rounded-xl surface-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-[13px] font-medium text-foreground">
          Failure Patterns
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Common failure modes detected across runs
        </p>
      </div>

      {categories.length > 0 && (
        <div className="px-5 py-3 flex items-center gap-2 border-b border-border overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
              !selectedCategory
                ? "bg-muted/40 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            )}
          >
            All ({patterns.length})
          </button>
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.category] ?? HelpCircle;
            return (
              <button
                key={cat.category}
                type="button"
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === cat.category ? null : cat.category
                  )
                }
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
                  selectedCategory === cat.category
                    ? "bg-muted/40"
                    : "hover:bg-muted/20",
                  CATEGORY_COLORS[cat.category] ?? "text-muted-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {cat.label} ({cat.count})
              </button>
            );
          })}
        </div>
      )}

      <div className="divide-y divide-border">
        {filteredPatterns.slice(0, 10).map((pattern) => {
          const Icon = CATEGORY_ICONS[pattern.category] ?? HelpCircle;
          const color = CATEGORY_COLORS[pattern.category] ?? "text-muted-foreground";

          return (
            <div
              key={pattern.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-muted/15 transition-colors"
            >
              <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", color)} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/90 line-clamp-2">
                  {pattern.pattern}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    {pattern.occurrences}x
                  </span>
                  <span>
                    {pattern.testCaseIds.length} test{pattern.testCaseIds.length !== 1 ? "s" : ""}
                  </span>
                  <span>
                    Last:{" "}
                    {formatDistanceToNow(new Date(pattern.lastSeenAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 mt-0.5 shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
