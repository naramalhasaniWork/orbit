"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  SplitSquareVertical,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info,
  Shield,
  ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  changeIntensity: number;
}

interface BrandIssue {
  severity: "critical" | "warning" | "info";
  category: "color" | "typography" | "spacing" | "layout" | "accessibility";
  description: string;
  element?: string;
  suggestion?: string;
}

export interface VisualDiffData {
  baselineUrl?: string;
  currentUrl: string;
  isBaselineCapture: boolean;
  diff?: {
    diffPercentage: number;
    regions: DiffRegion[];
    isRegression: boolean;
    summary: string;
    identical: boolean;
  };
  brandCheck?: {
    score: number;
    issues: BrandIssue[];
    passed: boolean;
  };
  routePath: string;
  screenshotKey: string;
  checksum?: string;
}

interface VisualDiffViewerProps {
  data: VisualDiffData;
  projectId: string;
  runId: string;
  onAcceptBaseline?: () => void;
}

// ============================================================
// Severity Config
// ============================================================

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: "text-orbit-fail", bg: "bg-orbit-fail/10", border: "border-orbit-fail/30" },
  warning: { icon: AlertTriangle, color: "text-orbit-flaky", bg: "bg-orbit-flaky/10", border: "border-orbit-flaky/30" },
  info: { icon: Info, color: "text-orbit-accent", bg: "bg-orbit-accent/10", border: "border-orbit-accent/30" },
} as const;

// ============================================================
// Sub-components
// ============================================================

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "text-orbit-pass" : score >= 70 ? "text-orbit-flaky" : "text-orbit-fail";
  const bgColor = score >= 90 ? "bg-orbit-pass" : score >= 70 ? "bg-orbit-flaky" : "bg-orbit-fail";

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-10 w-10">
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
          <path
            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted/30"
          />
          <path
            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${score}, 100`}
            className={color}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-bold", color)}>
          {score}
        </span>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("flex items-center gap-1.5 mt-0.5")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", bgColor)} />
          <span className={cn("text-xs font-medium", color)}>
            {score >= 90 ? "Excellent" : score >= 70 ? "Good" : "Needs work"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImagePanel({ url, label, fallback }: { url?: string; label: string; fallback?: string }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed border-border/50 bg-orbit-surface-2">
        <ImageOff className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <span className="text-xs text-muted-foreground">{fallback ?? "No image available"}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="rounded-lg border border-border/50 overflow-hidden bg-orbit-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="w-full h-auto" />
      </div>
    </div>
  );
}

function DiffRegionOverlay({ regions }: { regions: DiffRegion[] }) {
  if (regions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Changed Regions ({regions.length})
      </div>
      <div className="grid gap-1.5">
        {regions.map((region, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-3 py-1.5 rounded-md bg-orbit-surface-2 text-xs"
          >
            <span className="text-muted-foreground font-mono">
              ({region.x}, {region.y}) {region.width}x{region.height}
            </span>
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 border",
                region.changeIntensity > 0.7
                  ? "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30"
                  : region.changeIntensity > 0.3
                    ? "bg-orbit-flaky/15 text-orbit-flaky border-orbit-flaky/30"
                    : "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30"
              )}
            >
              {Math.round(region.changeIntensity * 100)}%
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandIssuesList({
  issues,
  severityFilter,
}: {
  issues: BrandIssue[];
  severityFilter: string | null;
}) {
  const filtered = severityFilter
    ? issues.filter((i) => i.severity === severityFilter)
    : issues;

  if (filtered.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No issues to display
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {filtered.map((issue, i) => {
        const config = SEVERITY_CONFIG[issue.severity];
        const Icon = config.icon;

        return (
          <div key={i} className={cn("rounded-lg border px-3 py-2.5", config.bg, config.border)}>
            <div className="flex items-start gap-2">
              <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", config.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge className="text-[9px] px-1 py-0 bg-white/[0.06] text-muted-foreground border-border/30">
                    {issue.category}
                  </Badge>
                  {issue.element && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                      {issue.element}
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/90">{issue.description}</p>
                {issue.suggestion && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Fix: {issue.suggestion}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function VisualDiffViewer({
  data,
  projectId,
  runId,
  onAcceptBaseline,
}: VisualDiffViewerProps) {
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const handleAcceptBaseline = useCallback(async () => {
    setAccepting(true);
    try {
      await fetch(`/api/projects/${projectId}/baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routePath: data.routePath,
          storageKey: data.screenshotKey,
          checksum: data.checksum ?? "",
          runId,
        }),
      });
      onAcceptBaseline?.();
    } finally {
      setAccepting(false);
    }
  }, [projectId, runId, data, onAcceptBaseline]);

  const brandIssues = data.brandCheck?.issues ?? [];
  const severityCounts = {
    critical: brandIssues.filter((i) => i.severity === "critical").length,
    warning: brandIssues.filter((i) => i.severity === "warning").length,
    info: brandIssues.filter((i) => i.severity === "info").length,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 rounded-xl border border-border/50 bg-orbit-surface-1 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-orbit-accent" />
          <h3 className="text-sm font-medium text-foreground">Visual QA</h3>
          <span className="text-xs text-muted-foreground font-mono">{data.routePath}</span>
        </div>
        <div className="flex items-center gap-2">
          {data.diff && !data.diff.identical && (
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 border",
                data.diff.isRegression
                  ? "bg-orbit-fail/15 text-orbit-fail border-orbit-fail/30"
                  : "bg-orbit-pass/15 text-orbit-pass border-orbit-pass/30"
              )}
            >
              {data.diff.isRegression ? "Regression" : "Passed"} ({data.diff.diffPercentage.toFixed(1)}% diff)
            </Badge>
          )}
          {data.isBaselineCapture && (
            <Badge className="text-[10px] px-1.5 py-0 bg-orbit-accent/15 text-orbit-accent border border-orbit-accent/30">
              Baseline Captured
            </Badge>
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-6">
        {data.diff && !data.isBaselineCapture && (
          <ScoreGauge score={Math.round(100 - data.diff.diffPercentage)} label="Visual Match" />
        )}
        {data.brandCheck && (
          <ScoreGauge score={data.brandCheck.score} label="Brand Score" />
        )}
      </div>

      {/* Diff Summary */}
      {data.diff?.summary && (
        <div className="text-xs text-muted-foreground bg-orbit-surface-2 rounded-md px-3 py-2">
          {data.diff.summary}
        </div>
      )}

      {/* Tabs: Side-by-Side / Brand */}
      <Tabs defaultValue="comparison">
        <TabsList>
          <TabsTrigger value="comparison" className="text-xs">
            <SplitSquareVertical className="h-3 w-3 mr-1.5" />
            Comparison
          </TabsTrigger>
          {data.brandCheck && (
            <TabsTrigger value="brand" className="text-xs">
              <Shield className="h-3 w-3 mr-1.5" />
              Brand ({brandIssues.length})
            </TabsTrigger>
          )}
          {data.diff?.regions && data.diff.regions.length > 0 && (
            <TabsTrigger value="regions" className="text-xs">
              <Layers className="h-3 w-3 mr-1.5" />
              Regions ({data.diff.regions.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="comparison">
          <div className="grid grid-cols-2 gap-3">
            <ImagePanel
              url={data.baselineUrl}
              label="Baseline"
              fallback={data.isBaselineCapture ? "First run - baseline captured" : "No baseline"}
            />
            <ImagePanel url={data.currentUrl} label="Current" />
          </div>
        </TabsContent>

        {data.brandCheck && (
          <TabsContent value="brand">
            <div className="space-y-3">
              {/* Severity Filter */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSeverityFilter(null)}
                  className={cn(
                    "text-xs px-2 py-1 rounded-md transition-colors",
                    !severityFilter
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All ({brandIssues.length})
                </button>
                {(["critical", "warning", "info"] as const).map((sev) =>
                  severityCounts[sev] > 0 ? (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                      className={cn(
                        "text-xs px-2 py-1 rounded-md transition-colors",
                        severityFilter === sev ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                        SEVERITY_CONFIG[sev].color
                      )}
                    >
                      {sev} ({severityCounts[sev]})
                    </button>
                  ) : null
                )}
              </div>
              <BrandIssuesList issues={brandIssues} severityFilter={severityFilter} />
            </div>
          </TabsContent>
        )}

        {data.diff?.regions && data.diff.regions.length > 0 && (
          <TabsContent value="regions">
            <DiffRegionOverlay regions={data.diff.regions} />
          </TabsContent>
        )}
      </Tabs>

      {/* Accept as Baseline */}
      {!data.isBaselineCapture && data.diff && !data.diff.identical && (
        <div className="flex items-center justify-end pt-2 border-t border-border/30">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAcceptBaseline}
            disabled={accepting}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            {accepting ? "Accepting..." : "Accept as New Baseline"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
