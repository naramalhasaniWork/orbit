import type { MapNode, MapEdge } from "@/components/dashboard/map-types";

export interface RepoItem {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar?: string;
  language: string;
  stars: number;
  defaultBranch: string;
  updatedAt: string;
  isPrivate: boolean;
  url: string;
  source?: "oauth" | "installation";
}

export interface SyncStatus {
  status: "waiting" | "indexing" | "complete" | "failed" | "error" | "timeout";
  progress: number;
  phase?: string;
  nodeCount?: number;
  error?: string;
}

export interface SystemMapData {
  nodes: MapNode[];
  edges: MapEdge[];
  summary: {
    totalNodes: number;
    totalEdges: number;
    routes: number;
    components: number;
    endpoints: number;
    models: number;
  };
}

export interface PlanTestCase {
  id: string;
  name: string;
  type: string;
  journey: string | null;
  priorityScore: number;
  criticality: number;
  isEnabled: boolean;
  isCritical: boolean;
  /** The planner's reason for the test. */
  rationale: string | null;
  /** System Map routes its steps go through. */
  touches: string[];
}

export interface RunResult {
  id: string;
  testCaseId: string;
  verdict: "pass" | "fail" | "flaky" | "skipped" | "healed";
  durationMs: number | null;
  testCase: {
    id: string;
    name: string;
    journey: string | null;
  };
}

export interface RunStatus {
  id: string;
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  results: RunResult[];
}
