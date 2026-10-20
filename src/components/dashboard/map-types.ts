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

export type ChangeStatus = "added" | "modified" | "unchanged";

export interface MapNode {
  id: string;
  type: NodeType;
  name: string;
  filePath: string | null;
  metadata: Record<string, unknown> | null;
  testStatus?: TestStatus;
  changeStatus?: ChangeStatus;
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
  pass: { label: "Passing", color: "#18794E" },
  fail: { label: "Failing", color: "#A3122F" },
  flaky: { label: "Flaky", color: "#5E6B7A" },
  untested: { label: "Untested", color: "#6B717B" },
};

export const CHANGE_STATUS_CONFIG: Record<ChangeStatus, { label: string; color: string }> = {
  added: { label: "New", color: "#3A5F8F" },
  modified: { label: "Changed", color: "#4A5059" },
  unchanged: { label: "Unchanged", color: "" },
};

export const ACCENT_COLOR = "#FF5B14";
