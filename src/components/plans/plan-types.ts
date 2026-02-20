export interface TestCaseData {
  id: string;
  name: string;
  type: string;
  journey: string | null;
  priorityScore: number;
  criticality: number;
  risk: number;
  coverageGap: number;
  steps: unknown;
  rationale: string | null;
  edgeCases: unknown;
  isEnabled: boolean;
  isCritical: boolean;
  lastVerdict: string | null;
}

export interface TestPlanData {
  id: string;
  version: number;
  isActive: boolean;
  generatedBy: string;
  summary: unknown;
  createdAt: Date;
  updatedAt: Date;
  testCases: TestCaseData[];
}

export interface PlanSummaryStats {
  total: number;
  byType: Record<string, number>;
  enabled: number;
  critical: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
}

export const TEST_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  journey: { label: "Journey", className: "bg-orbit-accent/15 text-orbit-accent border-orbit-accent/30" },
  api_contract: { label: "API", className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  auth: { label: "Auth", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  form_validation: { label: "Form", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  edge_case: { label: "Edge Case", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  regression: { label: "Regression", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

export function getPriorityTier(score: number): { label: string; className: string } {
  if (score >= 80) return { label: "Critical", className: "text-orbit-fail" };
  if (score >= 60) return { label: "High", className: "text-orbit-flaky" };
  if (score >= 30) return { label: "Medium", className: "text-foreground" };
  return { label: "Low", className: "text-muted-foreground" };
}

export function computePlanStats(testCases: TestCaseData[]): PlanSummaryStats {
  const byType: Record<string, number> = {};

  for (const tc of testCases) {
    byType[tc.type] = (byType[tc.type] ?? 0) + 1;
  }

  return {
    total: testCases.length,
    byType,
    enabled: testCases.filter((tc) => tc.isEnabled).length,
    critical: testCases.filter((tc) => tc.isCritical).length,
    highPriority: testCases.filter((tc) => tc.priorityScore >= 60).length,
    mediumPriority: testCases.filter((tc) => tc.priorityScore >= 30 && tc.priorityScore < 60).length,
    lowPriority: testCases.filter((tc) => tc.priorityScore < 30).length,
  };
}
