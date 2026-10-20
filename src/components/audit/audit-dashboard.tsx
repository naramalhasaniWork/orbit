"use client";

import { Pending } from "@/components/telemetry/pending";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ScoreDisplay } from "@/components/audit/score-display";
import { CategoryBars } from "@/components/audit/category-bars";
import { IssueList } from "@/components/audit/issue-list";
import { AuditTrendChart } from "@/components/audit/trend-chart";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-client";

interface AuditIssue {
  id: string;
  severity: string;
  category: string;
  file: string;
  line: number;
  title: string;
  description: string;
  suggestion: string;
  codeSnippet: string;
}

interface AuditSummary {
  id: string;
  overallScore: number;
  issueCount: number;
  criticalCount: number;
  categories: Record<string, { score: number; issues: string[] }>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AuditDetail extends AuditSummary {
  issues: AuditIssue[];
}

interface AuditDashboardProps {
  projectId: string;
  projectName: string;
  audits: AuditSummary[];
}

export function AuditDashboard({
  projectId,
  projectName,
  audits: initialAudits,
}: AuditDashboardProps) {
  const [audits, setAudits] = useState(initialAudits);
  const [selectedAudit, setSelectedAudit] = useState<AuditDetail | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const latestAudit = audits[0] ?? null;
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadAuditDetail = useCallback(
    async (auditId: string) => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/audit/${auditId}`
        );
        if (!res.ok) throw new Error(await apiErrorMessage(res, "Failed to load audit"));
        const { data } = await res.json();
        setSelectedAudit(data);
      } catch (err) {
        setAuditError(err instanceof Error ? err.message : "Failed to load audit");
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  const triggerAudit = useCallback(async () => {
    setIsRunning(true);
    setAuditError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Audit failed"));
      const { data } = await res.json();

      // Refresh audit list
      const listRes = await fetch(`/api/projects/${projectId}/audit`);
      if (listRes.ok) {
        const { data: freshAudits } = await listRes.json();
        setAudits(freshAudits);
      }

      // Load the new audit detail
      await loadAuditDetail(data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audit failed";
      setAuditError(message);
    } finally {
      setIsRunning(false);
    }
  }, [projectId, loadAuditDetail]);

  // If no audits exist, show empty state
  if (audits.length === 0 && !isRunning) {
    return (
      <div className="p-6">
        <EmptyState
          icon={ShieldCheck}
          title="No code audits yet"
          description={`Run your first audit on ${projectName} to get AI-powered code quality insights.`}
          action={
            <div className="flex flex-col items-center gap-3">
              <Button onClick={triggerAudit} disabled={isRunning}>
                {isRunning ? (
                  <Pending />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Run First Audit
              </Button>
              {auditError && <AuditErrorNotice message={auditError} />}
            </div>
          }
        />
      </div>
    );
  }

  const displayAudit = selectedAudit ?? latestAudit;
  const trendData = audits
    .slice(0, 10)
    .reverse()
    .map((a) => ({
      date: a.createdAt,
      score: a.overallScore,
      issues: a.issueCount,
    }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-foreground">Code Audit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{projectName}</p>
        </div>
        <Button onClick={triggerAudit} disabled={isRunning} size="sm">
          {isRunning ? (
            <Pending />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          {isRunning ? "Auditing..." : "Run Audit"}
        </Button>
      </div>

      {/* Audit error */}
      {auditError && <AuditErrorNotice message={auditError} />}

      {/* Score + Categories overview */}
      {displayAudit && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Score card */}
          <div className="surface-1 rounded-xl border border-border p-6 flex flex-col items-center justify-center">
            <ScoreDisplay score={displayAudit.overallScore} label="Overall" />
            <div className="flex items-center gap-4 mt-4 text-sm">
              <span className="text-muted-foreground">
                {displayAudit.issueCount} issues
              </span>
              {displayAudit.criticalCount > 0 && (
                <span className="flex items-center gap-1 text-tm-fail">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {displayAudit.criticalCount} critical
                </span>
              )}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="surface-1 rounded-xl border border-border p-6 lg:col-span-2">
            <h2 className="text-sm font-medium text-foreground mb-4">
              Category Breakdown
            </h2>
            <CategoryBars
              categories={
                displayAudit.categories as Record<
                  string,
                  { score: number; issues: string[] }
                >
              }
            />
          </div>
        </motion.div>
      )}

      {/* Trend chart */}
      {trendData.length > 1 && (
        <div className="surface-1 rounded-xl border border-border p-6">
          <h2 className="text-sm font-medium text-foreground mb-4">
            Score Trend
          </h2>
          <AuditTrendChart data={trendData} />
        </div>
      )}

      {/* Past audits selector */}
      {audits.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {audits.slice(0, 10).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => loadAuditDetail(a.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                displayAudit?.id === a.id
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              {new Date(a.createdAt).toLocaleDateString()} — {a.overallScore}
            </button>
          ))}
        </div>
      )}

      {/* Issue list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Pending />
        </div>
      ) : selectedAudit ? (
        <div className="surface-1 rounded-xl border border-border p-6">
          <h2 className="text-sm font-medium text-foreground mb-4">
            Issues ({selectedAudit.issues.length})
          </h2>
          <IssueList issues={selectedAudit.issues} />
        </div>
      ) : null}
    </div>
  );
}

function AuditErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 text-sm text-orbit-fail bg-orbit-fail/10 rounded-md px-3 py-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
