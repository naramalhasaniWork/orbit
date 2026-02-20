"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { StatusDot } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";
import {
  type TestCaseData,
  TEST_TYPE_CONFIG,
  getPriorityTier,
} from "@/components/plans/plan-types";
import { TestCaseEditor } from "@/components/plans/test-case-editor";

interface TestCaseCardProps {
  testCase: TestCaseData;
  projectId?: string;
}

export function TestCaseCard({ testCase, projectId }: TestCaseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [enabled, setEnabled] = useState(testCase.isEnabled);

  async function handleToggleEnabled(checked: boolean) {
    setEnabled(checked);
    if (projectId) {
      await fetch(`/api/projects/${projectId}/test-cases/${testCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: checked }),
      });
    }
  }

  const typeConfig = TEST_TYPE_CONFIG[testCase.type];
  const priority = getPriorityTier(testCase.priorityScore);
  const steps = parseSteps(testCase.steps);

  if (isEditing && projectId) {
    return (
      <TestCaseEditor
        projectId={projectId}
        testCase={testCase}
        onSave={() => {
          setIsEditing(false);
          window.location.reload();
        }}
        onClose={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg bg-muted/20 transition-colors",
        !enabled && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {testCase.lastVerdict && (
          <StatusDot
            status={mapVerdictToStatus(testCase.lastVerdict)}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {testCase.name}
            </span>
            {testCase.isCritical && (
              <ShieldAlert className="h-3.5 w-3.5 text-orbit-fail shrink-0" />
            )}
          </div>
          {testCase.rationale && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {testCase.rationale}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Badge
            className={cn(
              "text-[10px] px-1.5 py-0 font-medium border",
              typeConfig?.className ?? "bg-muted/50 text-muted-foreground border-border/50"
            )}
          >
            {typeConfig?.label ?? testCase.type}
          </Badge>

          <span className={cn("text-xs font-medium tabular-nums", priority.className)}>
            {testCase.priorityScore}
          </span>

          {projectId && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-muted-foreground/50 hover:text-orbit-accent transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}

          <Switch
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
            className="scale-75"
          />
        </div>
      </div>

      {isExpanded && (
        <ExpandedDetails
          steps={steps}
          rationale={testCase.rationale}
          edgeCases={testCase.edgeCases}
          priorityScore={testCase.priorityScore}
          criticality={testCase.criticality}
          risk={testCase.risk}
          coverageGap={testCase.coverageGap}
        />
      )}
    </div>
  );
}

function ExpandedDetails({
  steps,
  rationale,
  edgeCases,
  priorityScore,
  criticality,
  risk,
  coverageGap,
}: {
  steps: string[];
  rationale: string | null;
  edgeCases: unknown;
  priorityScore: number;
  criticality: number;
  risk: number;
  coverageGap: number;
}) {
  const parsedEdgeCases = Array.isArray(edgeCases) ? (edgeCases as string[]) : [];

  return (
    <div className="px-4 pb-3 pt-1 border-t border-border space-y-3">
      {rationale && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Rationale
          </span>
          <p className="text-xs text-foreground/80 mt-0.5">{rationale}</p>
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Steps
          </span>
          <ol className="mt-1 space-y-1">
            {steps.map((step, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-2">
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {i + 1}.
                </span>
                {typeof step === "string" ? step : JSON.stringify(step)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {parsedEdgeCases.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Edge Cases
          </span>
          <ul className="mt-1 space-y-0.5">
            {parsedEdgeCases.map((ec, i) => (
              <li key={i} className="text-xs text-foreground/80 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-muted-foreground/50">
                {ec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-4">
        <ScoreChip label="Priority" value={priorityScore} />
        <ScoreChip label="Criticality" value={criticality} />
        <ScoreChip label="Risk" value={risk} />
        <ScoreChip label="Gap" value={coverageGap} />
      </div>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          value >= 80 && "text-orbit-fail",
          value >= 60 && value < 80 && "text-orbit-flaky",
          value >= 30 && value < 60 && "text-foreground",
          value < 30 && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function mapVerdictToStatus(verdict: string): "pass" | "fail" | "flaky" | "untested" | "skipped" {
  if (verdict === "healed") return "pass";
  if (verdict === "pass" || verdict === "fail" || verdict === "flaky" || verdict === "skipped") {
    return verdict;
  }
  return "untested";
}

function parseSteps(steps: unknown): string[] {
  if (Array.isArray(steps)) {
    return steps.map((s) => (typeof s === "string" ? s : (s as { action?: string })?.action ?? JSON.stringify(s)));
  }
  return [];
}
