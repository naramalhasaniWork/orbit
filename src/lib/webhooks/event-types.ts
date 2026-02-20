// ============================================================
// Webhook Event Types (delivered via HTTP POST to user URLs)
// From spec Section 7 — REST API & Webhooks
// ============================================================

export interface WebhookRunStartedPayload {
  runId: string;
  projectId: string;
  mode: string;
  trigger: string;
  totalTests: number;
  triggeredBy: string | null;
  timestamp: string;
}

export interface WebhookRunCompletedPayload {
  runId: string;
  projectId: string;
  status: "completed" | "failed" | "cancelled";
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number | null;
  timestamp: string;
}

export interface WebhookRunFailedPayload {
  runId: string;
  projectId: string;
  error: string;
  timestamp: string;
}

export interface WebhookTestFailedPayload {
  runId: string;
  projectId: string;
  testCaseId: string;
  testCaseName: string;
  failureExplanation: string | null;
  screenshotUrl: string | null;
  timestamp: string;
}

export interface WebhookTestFlakyPayload {
  runId: string;
  projectId: string;
  testCaseId: string;
  testCaseName: string;
  passRate: number;
  lastTenResults: string[];
  timestamp: string;
}

export interface WebhookBugDiscoveredPayload {
  runId: string;
  projectId: string;
  testCaseId: string;
  testCaseName: string;
  failureExplanation: string;
  suggestedFix: string | null;
  screenshotUrl: string | null;
  consecutiveFailures: number;
  timestamp: string;
}

export interface WebhookPlanUpdatedPayload {
  projectId: string;
  testPlanId: string;
  totalTestCases: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  reason: string;
  timestamp: string;
}

// Discriminated union of all webhook events
export type WebhookEvent =
  | { type: "run.started"; payload: WebhookRunStartedPayload }
  | { type: "run.completed"; payload: WebhookRunCompletedPayload }
  | { type: "run.failed"; payload: WebhookRunFailedPayload }
  | { type: "test.failed"; payload: WebhookTestFailedPayload }
  | { type: "test.flaky"; payload: WebhookTestFlakyPayload }
  | { type: "bug.discovered"; payload: WebhookBugDiscoveredPayload }
  | { type: "plan.updated"; payload: WebhookPlanUpdatedPayload };

export type WebhookEventType = WebhookEvent["type"];

export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  "run.started",
  "run.completed",
  "run.failed",
  "test.failed",
  "test.flaky",
  "bug.discovered",
  "plan.updated",
];
