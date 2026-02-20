// ============================================================
// WebSocket Event Payload Types
// ============================================================

export interface RunStartedEvent {
  runId: string;
  projectId: string;
  mode: string;
  trigger: string;
  totalTests: number;
}

export interface RunProgressEvent {
  runId: string;
  status: string;
  currentTest: string;
  totalTests: number;
  passed: number;
  failed: number;
}

export interface RunCompletedEvent {
  runId: string;
  projectId: string;
  status: "completed" | "failed" | "cancelled";
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  durationMs: number | null;
}

export interface TestCompletedEvent {
  runId: string;
  testCaseId: string;
  testCaseName: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number;
}

export interface IndexingProgressEvent {
  projectId: string;
  phase: string;
  message: string;
  nodesFound: number;
  progress: number;
}

export interface TestResultEvent {
  runId: string;
  testCaseId: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number;
}

// Union type for all WebSocket events
export type WebSocketEvent =
  | { type: "run:started"; payload: RunStartedEvent }
  | { type: "run:progress"; payload: RunProgressEvent }
  | { type: "run:completed"; payload: RunCompletedEvent }
  | { type: "test:completed"; payload: TestCompletedEvent }
  | { type: "indexing:progress"; payload: IndexingProgressEvent }
  | { type: "test:result"; payload: TestResultEvent };
