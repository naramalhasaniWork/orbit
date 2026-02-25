// Shared types for Operations Flow visualization

export type OperationType =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "submit"
  | "approve"
  | "configure";

export interface Operation {
  id: string;
  name: string;
  type: OperationType;
  nodeIds: string[];
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  operations: string[];
  criticalPath: boolean;
}

export interface Dependency {
  operationId: string;
  dependsOn: string[];
}

export interface OperationsFlowProps {
  operations: Operation[];
  flows: Flow[];
  dependencies: Dependency[];
  compact?: boolean;
  readonly?: boolean;
}

export interface OperationGraphNode {
  id: string;
  name: string;
  type: OperationType;
  nodeIds: string[];
  flowId?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface OperationGraphLink {
  source: string;
  target: string;
  id: string;
}

export const OPERATION_TYPE_COLORS: Record<OperationType, string> = {
  create: "#22c55e",
  read: "#3b82f6",
  update: "#f59e0b",
  delete: "#ef4444",
  submit: "#a855f7",
  approve: "#06b6d4",
  configure: "#6b7280",
};

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  submit: "Submit",
  approve: "Approve",
  configure: "Configure",
};

export const ACCENT_COLOR = "#ff6000";
