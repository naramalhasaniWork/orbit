// ============================================================
// Real-Time Event Payload Types
// ============================================================

// --- Indexing Events ---

export interface IndexingStartedEvent {
  projectId: string;
  branch: string;
  isIncremental: boolean;
}

export interface IndexingPhaseEvent {
  projectId: string;
  phase: IndexingPhase;
  message: string;
  progress: number;
}

export type IndexingPhase =
  | "clone"
  | "framework"
  | "ast"
  | "routes"
  | "components"
  | "embeddings"
  | "complete"
  | "error";

export interface IndexingNodeDiscoveredEvent {
  projectId: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  filePath: string | null;
}

export interface IndexingProgressEvent {
  projectId: string;
  phase: string;
  message: string;
  nodesFound: number;
  progress: number;
}

export interface IndexingCompletedEvent {
  projectId: string;
  nodesFound: number;
  edgesFound: number;
  durationMs: number;
}

export interface IndexingFailedEvent {
  projectId: string;
  error: string;
  phase: string;
}

// --- Run Events ---

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

// --- Test Events ---

export interface TestStartedEvent {
  runId: string;
  testCaseId: string;
  testCaseName: string;
}

export interface TestStepEvent {
  runId: string;
  testCaseId: string;
  stepIndex: number;
  action: string;
  status: "running" | "passed" | "failed";
  screenshotUrl?: string;
}

export interface TestCompletedEvent {
  runId: string;
  testCaseId: string;
  testCaseName: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number;
}

export interface TestScreenshotEvent {
  runId: string;
  testCaseId: string;
  stepIndex: number;
  screenshotUrl: string;
  timestamp: number;
}

export interface TestResultEvent {
  runId: string;
  testCaseId: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number;
}

// --- Heartbeat ---

export interface HeartbeatEvent {
  timestamp: number;
}

// ============================================================
// Union types for each domain
// ============================================================

export type IndexingEvent =
  | { type: "indexing:started"; payload: IndexingStartedEvent }
  | { type: "indexing:phase"; payload: IndexingPhaseEvent }
  | { type: "indexing:node_discovered"; payload: IndexingNodeDiscoveredEvent }
  | { type: "indexing:progress"; payload: IndexingProgressEvent }
  | { type: "indexing:completed"; payload: IndexingCompletedEvent }
  | { type: "indexing:failed"; payload: IndexingFailedEvent };

export type RunEvent =
  | { type: "run:started"; payload: RunStartedEvent }
  | { type: "run:progress"; payload: RunProgressEvent }
  | { type: "run:completed"; payload: RunCompletedEvent };

export type TestEvent =
  | { type: "test:started"; payload: TestStartedEvent }
  | { type: "test:step"; payload: TestStepEvent }
  | { type: "test:completed"; payload: TestCompletedEvent }
  | { type: "test:screenshot"; payload: TestScreenshotEvent }
  | { type: "test:result"; payload: TestResultEvent };

export type WebSocketEvent =
  | IndexingEvent
  | RunEvent
  | TestEvent
  | { type: "heartbeat"; payload: HeartbeatEvent };
