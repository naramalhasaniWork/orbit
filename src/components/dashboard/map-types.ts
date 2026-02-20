// Shared types for System Map components

export type NodeType =
  | "route"
  | "component"
  | "endpoint"
  | "model"
  | "auth_strategy"
  | "middleware"
  | "utility";

export type TestStatus = "pass" | "fail" | "flaky" | "untested";

export interface MapNode {
  id: string;
  type: NodeType;
  name: string;
  filePath: string | null;
  metadata: Record<string, unknown> | null;
  testStatus?: TestStatus;
}

export interface MapEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
}

export interface GraphNode extends MapNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  relationship: string;
  id: string;
}

export interface NodeTypeConfig {
  label: string;
  size: number;
}

export interface StatusConfig {
  label: string;
  color: string;
}

export const NODE_TYPE_CONFIG: Record<string, NodeTypeConfig> = {
  route: { label: "Routes", size: 8 },
  component: { label: "Components", size: 6 },
  endpoint: { label: "Endpoints", size: 7 },
  model: { label: "Models", size: 7 },
  auth_strategy: { label: "Auth", size: 6 },
  middleware: { label: "Middleware", size: 5 },
  utility: { label: "Utilities", size: 4 },
};

export const STATUS_CONFIG: Record<TestStatus, StatusConfig> = {
  pass: { label: "Passing", color: "#22c55e" },
  fail: { label: "Failing", color: "#ef4444" },
  flaky: { label: "Flaky", color: "#f59e0b" },
  untested: { label: "Untested", color: "#6b7280" },
};

export const ACCENT_COLOR = "#ff6000";
