"use client";

import { useState, useEffect } from "react";
import {
  Lightbulb,
  AlertTriangle,
  ShieldAlert,
  Clock,
  TrendingDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface AISuggestionsPanelProps {
  projectId: string;
  onGeneratePlan?: () => void;
}

function handleSuggestionAction(
  suggestion: Suggestion,
  projectId: string,
  onGeneratePlan?: () => void
) {
  switch (suggestion.actionType) {
    case "generate_tests":
    case "add_tests":
    case "generate_plan":
      // Trigger plan regeneration
      if (onGeneratePlan) {
        onGeneratePlan();
      } else {
        window.location.href = `/dashboard/plans?project=${projectId}&generate=true`;
      }
      break;
    case "view_flaky":
    case "quarantine":
      window.location.href = `/dashboard/runs?project=${projectId}`;
      break;
    case "view_failures":
    case "investigate":
      window.location.href = `/dashboard/runs?project=${projectId}`;
      break;
    case "reindex":
      fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: "main" }),
      }).then(() => window.location.reload());
      break;
    default:
      // Navigate to agent for complex actions
      window.location.href = `/dashboard/agent?project=${projectId}`;
      break;
  }
}

const SEVERITY_CONFIG = {
  critical: {
    icon: ShieldAlert,
    border: "border-orbit-fail/20",
    bg: "bg-orbit-fail/5",
    text: "text-orbit-fail",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-orbit-flaky/20",
    bg: "bg-orbit-flaky/5",
    text: "text-orbit-flaky",
  },
  info: {
    icon: Lightbulb,
    border: "border-orbit-accent/20",
    bg: "bg-orbit-accent/5",
    text: "text-orbit-accent",
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

export function AISuggestionsPanel({ projectId, onGeneratePlan }: AISuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const res = await fetch(`/api/projects/${projectId}/suggestions`);
        if (res.ok) {
          const json = await res.json();
          setSuggestions(json.data?.suggestions ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSuggestions();
  }, [projectId]);

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  if (loading || visibleSuggestions.length === 0) return null;

  return (
    <div className="rounded-xl surface-1 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-muted/20 transition-colors"
      >
        <Lightbulb className="h-4 w-4 text-orbit-accent shrink-0" />
        <span className="text-[13px] font-medium text-foreground flex-1 text-left">
          AI Suggestions
        </span>
        <span className="text-xs text-muted-foreground">
          {visibleSuggestions.length}
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            !collapsed && "rotate-90"
          )}
        />
      </button>

      {!collapsed && (
        <div className="border-t border-border px-5 py-3 space-y-2">
          {visibleSuggestions.map((suggestion) => {
            const config = SEVERITY_CONFIG[suggestion.severity];
            const typeKey = suggestion.type ?? suggestion.category ?? "";
            const Icon = TYPE_ICONS[typeKey] ?? config.icon;

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
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "mt-1.5 h-6 px-2 text-[11px]",
                      config.text
                    )}
                    onClick={() =>
                      handleSuggestionAction(suggestion, projectId, onGeneratePlan)
                    }
                  >
                    {suggestion.actionLabel}
                  </Button>
                </div>
                <button
                  onClick={() =>
                    setDismissed((prev) => new Set([...Array.from(prev), suggestion.id]))
                  }
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
