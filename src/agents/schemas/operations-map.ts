import { z } from "zod";

export const OPERATION_TYPES = {
  create: "create",
  read: "read",
  update: "update",
  delete: "delete",
  submit: "submit",
  approve: "approve",
  configure: "configure",
} as const;

export const OperationSchema = z.object({
  id: z
    .string()
    .regex(/^op-/)
    .describe("Unique identifier following op-{name-slug} pattern"),
  name: z
    .string()
    .min(1)
    .describe("Human-readable name (e.g. 'Create Invoice', 'Submit Daily Log')"),
  type: z.enum(["create", "read", "update", "delete", "submit", "approve", "configure"]),
  nodeIds: z
    .array(z.string())
    .min(1)
    .describe("System map node IDs involved in this operation"),
  entryPoint: z
    .string()
    .describe("Primary route/endpoint node ID where the operation begins"),
  requiredInputs: z
    .array(z.string())
    .describe("Form fields, API params, or data this operation needs"),
  producedOutputs: z
    .array(z.string())
    .describe("Data, state changes, or side effects this operation creates"),
});

export const OperationalFlowSchema = z.object({
  id: z
    .string()
    .regex(/^flow-/)
    .describe("Unique identifier following flow-{name-slug} pattern"),
  name: z
    .string()
    .min(1)
    .describe("Human-readable flow name (e.g. 'Daily Log Approval Flow')"),
  description: z
    .string()
    .describe("What this flow accomplishes end-to-end"),
  operations: z
    .array(z.string())
    .min(1)
    .describe("Ordered operation IDs forming this flow"),
  criticalPath: z
    .boolean()
    .describe("Whether this flow is critical to the application's core purpose"),
});

export const FlowDependencySchema = z.object({
  operationId: z
    .string()
    .describe("The operation that has dependencies"),
  dependsOn: z
    .array(z.string())
    .describe("Operation IDs that must complete before this operation"),
  reason: z
    .string()
    .describe("Why this dependency exists (e.g. 'Invoice must exist before payment')"),
});

export const OperationsMapMetadataSchema = z.object({
  totalOperations: z.number().int().min(0),
  totalFlows: z.number().int().min(0),
  criticalFlows: z.number().int().min(0),
  maxDependencyDepth: z.number().int().min(0),
});

export const OperationsMapSchema = z.object({
  projectId: z.string(),
  generatedAt: z.string().describe("ISO 8601 timestamp"),
  operations: z.array(OperationSchema),
  flows: z.array(OperationalFlowSchema),
  dependencies: z.array(FlowDependencySchema),
  metadata: OperationsMapMetadataSchema,
});

export type Operation = z.infer<typeof OperationSchema>;
export type OperationalFlow = z.infer<typeof OperationalFlowSchema>;
export type FlowDependency = z.infer<typeof FlowDependencySchema>;
export type OperationsMapMetadata = z.infer<typeof OperationsMapMetadataSchema>;
export type OperationsMap = z.infer<typeof OperationsMapSchema>;
