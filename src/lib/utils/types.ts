import type { Session } from "next-auth";

// ============================================================
// SESSION & AUTH TYPES
// ============================================================

export interface OrbitSession extends Session {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  workspaceId: string;
  workspaceSlug: string;
  role: "owner" | "admin" | "member" | "viewer" | "billing";
  userRole: "user" | "admin" | "super_admin";
  githubAccessToken?: string;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  message: string;
  code: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================
// SYSTEM MAP TYPES
// ============================================================

export interface SystemMapNode {
  id: string;
  projectId: string;
  type: "route" | "component" | "endpoint" | "model" | "auth_strategy" | "middleware";
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
  lastIndexedAt: string;
}

export interface SystemMapEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
  metadata: Record<string, unknown>;
}

export interface SystemMap {
  projectId: string;
  nodes: SystemMapNode[];
  edges: SystemMapEdge[];
  generatedAt: string;
}

// ============================================================
// TEST PLAN TYPES
// ============================================================

export interface TestStep {
  order: number;
  action: string;
  selector?: string;
  value?: string;
  expected: string;
}

export interface TestCase {
  id: string;
  testPlanId: string;
  projectId: string;
  name: string;
  type: "journey" | "api_contract" | "auth" | "form_validation" | "edge_case" | "regression";
  journey?: string;
  priorityScore: number;
  criticality: number;
  risk: number;
  coverageGap: number;
  steps: TestStep[];
  rationale?: string;
  edgeCases: string[];
  isEnabled: boolean;
  isCritical: boolean;
}

export interface TestPlan {
  id: string;
  projectId: string;
  version: number;
  isActive: boolean;
  generatedBy: string;
  summary: Record<string, unknown>;
  testCases: TestCase[];
  createdAt: string;
}

// ============================================================
// EXECUTION TYPES
// ============================================================

export interface StepResult {
  order: number;
  action: string;
  status: "pass" | "fail" | "skipped";
  durationMs: number;
  screenshotUrl?: string;
  error?: string;
  healedSelector?: string;
}

export interface TestResult {
  id: string;
  testRunId: string;
  testCaseId: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number;
  retryCount: number;
  steps: StepResult[];
  failureExplanation?: string;
  suggestedFix?: string;
  artifacts: Record<string, string>;
  healedSelectors: string[];
}

export interface RunSummary {
  id: string;
  projectId: string;
  status: "queued" | "indexing" | "planning" | "executing" | "reporting" | "completed" | "failed" | "cancelled";
  mode: "full" | "smoke" | "regression" | "targeted";
  trigger: "push" | "pr" | "scheduled" | "manual" | "linear" | "api" | "deploy";
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  creditsConsumed: number;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
}

// ============================================================
// CONFIG TYPES
// ============================================================

export interface EnvironmentConfig {
  id: string;
  projectId: string;
  name: string;
  type: "staging" | "preview" | "qa" | "production";
  url: string;
  teardownHookUrl?: string;
  isDefault: boolean;
}

export interface OrbitConfig {
  workspaceId: string;
  projectId: string;
  defaultBranch: string;
  framework?: string;
  environments: EnvironmentConfig[];
  settings: Record<string, unknown>;
}
