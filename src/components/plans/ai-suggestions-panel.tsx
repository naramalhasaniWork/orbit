"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import {
  Lightbulb,
  AlertTriangle,
  ShieldAlert,
  Clock,
  TrendingDown,
  ChevronRight,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  type?: string;
  category?: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  actionLabel: string;
  actionType: string;
}

const POLL_WINDOW_MS = 3 * 60 * 1000;

interface SuggestionsResponse {
  suggestions: Suggestion[];
  ai: { status: "ready" | "pending" | "disabled" | "unavailable"; generatedAt: string | null; stale: boolean };
}

interface AISuggestionsPanelProps {
  projectId: string;
  onGeneratePlan?: () => void;
  /** Increment to force a re-fetch (e.g. after a new plan is generated) */
  refreshKey?: number;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: ShieldAlert,
    border: "border-orbit-fail/20",
    bg: "bg-orbit-fail/5",
    text: "text-orbit-fail",
    hoverBg: "hover:bg-orbit-fail/10",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-orbit-flaky/20",
    bg: "bg-orbit-flaky/5",
    text: "text-orbit-flaky",
    hoverBg: "hover:bg-orbit-flaky/10",
  },
  info: {
    icon: Lightbulb,
    border: "border-orbit-accent/20",
    bg: "bg-orbit-accent/5",
    text: "text-orbit-accent",
    hoverBg: "hover:bg-orbit-accent/10",
  },
};

const TYPE_ICONS: Record<string, typeof Lightbulb> = {
  missing_coverage: ShieldAlert,
  coverage_gap: ShieldAlert,
  flaky_warning: AlertTriangle,
  flaky_pattern: AlertTriangle,
  regression_risk: TrendingDown,
  failure_trend: TrendingDown,
  stale_test: Clock,
  missing_test_type: Lightbulb,
  optimization: Lightbulb,
};

export function AISuggestionsPanel({ projectId, onGeneratePlan, refreshKey = 0 }: AISuggestionsPanelProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pollSince, setPollSince] = useState(() => Date.now());

  // Rule-based suggestions return immediately; AI ones come from a cache that
  // a background job fills, so poll while that job runs (bounded, in case no
  // worker is around to finish it).
  const { data, isLoading, mutate } = useSWR<SuggestionsResponse>(
    `/api/projects/${projectId}/suggestions`,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: (latest) =>
        (latest?.ai.status === "pending" || latest?.ai.stale) && Date.now() - pollSince < POLL_WINDOW_MS
          ? 5000
          : 0,
    }
  );
  const suggestions = data?.suggestions ?? [];
  const aiPending = data?.ai.status === "pending" || (data?.ai.stale ?? false);

  useEffect(() => {
    if (refreshKey > 0) {
      setPollSince(Date.now());
      void mutate();
    }
  }, [refreshKey, mutate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/projects/${projectId}/suggestions`, { method: "POST" });
      setPollSince(Date.now());
      await mutate();
    } finally {
      setRefreshing(false);
    }
  }, [projectId, mutate]);

  const handleAction = useCallback(
    async (e: React.MouseEvent, suggestion: Suggestion) => {
      e.stopPropagation();
      e.preventDefault();

      setActingOn(suggestion.id);

      try {
        switch (suggestion.actionType) {
          case "generate_tests":
          case "add_tests":
          case "generate_plan":
            if (onGeneratePlan) {
              onGeneratePlan();
            } else {
              router.push(`/dashboard/plans?project=${projectId}`);
            }
            break;

          case "quarantine":
          case "review":
          case "view_flaky":
          case "view_failures":
          case "investigate":
            router.push(`/dashboard/runs?project=${projectId}`);
            break;

          case "reindex":
            await fetch(`/api/projects/${projectId}/sync`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ branch: "main" }),
            });
            router.refresh();
            break;

          case "dismiss":
            setDismissed((prev) => new Set([...Array.from(prev), suggestion.id]));
            break;

          default:
            // Anything unrecognized → open agent chat
            router.push(`/dashboard/agent?project=${projectId}`);
            break;
        }
      } finally {
        // Clear acting state after a short delay for visual feedback
        setTimeout(() => setActingOn(null), 500);
      }
    },
    [projectId, onGeneratePlan, router]
  );

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  if (isLoading || (visibleSuggestions.length === 0 && !aiPending)) return null;

  return (
    <div className="rounded-xl surface-1 overflow-hidden">
      <div className="flex items-center gap-2 pr-3 hover:bg-muted/20 transition-colors">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center gap-2 pl-5 py-3 text-left"
        >
          <Lightbulb className="h-4 w-4 text-orbit-accent shrink-0" />
          <span className="text-[13px] font-medium text-foreground flex-1">AI Suggestions</span>
          {aiPending && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating AI insights
            </span>
          )}
          <span className="text-xs text-muted-foreground">{visibleSuggestions.length}</span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          />
        </button>
        {data?.ai.status !== "disabled" && (
          <button
            type="button"
            title="Regenerate AI suggestions"
            aria-label="Regenerate AI suggestions"
            disabled={refreshing || aiPending}
            onClick={() => void handleRefresh()}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", (refreshing || aiPending) && "animate-spin")} />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="border-t border-border px-5 py-3 space-y-2">
          {visibleSuggestions.map((suggestion) => {
            const config = SEVERITY_CONFIG[suggestion.severity];
            const typeKey = suggestion.type ?? suggestion.category ?? "";
            const Icon = TYPE_ICONS[typeKey] ?? config.icon;
            const isActing = actingOn === suggestion.id;

            return (
              <div
                key={suggestion.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  config.border,
                  config.bg
                )}
              >
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.text)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {suggestion.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {suggestion.description}
                  </p>
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={(e) => handleAction(e, suggestion)}
                    className={cn(
                      "mt-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-all",
                      config.text,
                      config.hoverBg,
                      "border border-transparent hover:border-current/20",
                      "active:scale-95",
                      isActing && "opacity-60 pointer-events-none"
                    )}
                  >
                    {isActing && <Loader2 className="h-3 w-3 animate-spin" />}
                    {suggestion.actionLabel}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissed((prev) => new Set([...Array.from(prev), suggestion.id]));
                  }}
                  className="text-muted-foreground/50 hover:text-muted-foreground shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
