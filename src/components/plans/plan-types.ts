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

// Type is a category, not a status: one neutral tag style for all of them.
const TYPE_TAG = "border-border bg-transparent text-tm-t2 font-label uppercase tracking-label";

export const TEST_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  journey: { label: "Journey", className: TYPE_TAG },
  api_contract: { label: "API", className: TYPE_TAG },
  auth: { label: "Auth", className: TYPE_TAG },
  form_validation: { label: "Form", className: TYPE_TAG },
  edge_case: { label: "Edge Case", className: TYPE_TAG },
  regression: { label: "Regression", className: TYPE_TAG },
};

export function getPriorityTier(score: number): { label: string; className: string } {
  // Priority is ink weight, never status colour: red means failed, nothing else.
  if (score >= 80) return { label: "Critical", className: "text-foreground" };
  if (score >= 60) return { label: "High", className: "text-foreground" };
  if (score >= 30) return { label: "Medium", className: "text-tm-t2" };
  return { label: "Low", className: "text-tm-t3" };
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
