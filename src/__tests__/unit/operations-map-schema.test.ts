import { describe, it, expect } from "vitest";
import { OperationsMapSchema, type OperationsMap } from "@/agents/schemas/operations-map";

function validOperationsMap(): OperationsMap {
  return {
    projectId: "proj-1",
    generatedAt: "2026-02-24T00:00:00Z",
    operations: [
      {
        id: "op-1",
        name: "Create User",
        type: "create" as const,
        nodeIds: ["node-1", "node-2"],
        entryPoint: "/api/users",
        requiredInputs: ["email", "password"],
        producedOutputs: ["userId", "sessionToken"],
      },
      {
        id: "op-2",
        name: "Get User Profile",
        type: "read" as const,
        nodeIds: ["node-3"],
        entryPoint: "/api/users/:id",
        requiredInputs: ["userId"],
        producedOutputs: ["userProfile"],
      },
    ],
    flows: [
      {
        id: "flow-1",
        name: "User Registration",
        description: "Complete user signup flow",
        operations: ["op-1", "op-2"],
        criticalPath: true,
      },
    ],
    dependencies: [
      {
        operationId: "op-2",
        dependsOn: ["op-1"],
        reason: "User must be created before profile can be read",
      },
    ],
    metadata: {
      totalOperations: 2,
      totalFlows: 1,
      criticalFlows: 1,
      maxDependencyDepth: 1,
    },
  };
}

describe("OperationsMapSchema", () => {
  it("validates a complete operations map", () => {
    const result = OperationsMapSchema.safeParse(validOperationsMap());
    expect(result.success).toBe(true);
  });

  it("validates all operation types", () => {
    const types = ["create", "read", "update", "delete", "submit", "approve", "configure"] as const;

    for (const type of types) {
      const data = validOperationsMap();
      data.operations[0].type = type;
      const result = OperationsMapSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid operation type", () => {
    const data = validOperationsMap();
    (data.operations[0] as Record<string, unknown>).type = "invalid_type";
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing projectId", () => {
    const data = validOperationsMap();
    delete (data as Record<string, unknown>).projectId;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing generatedAt", () => {
    const data = validOperationsMap();
    delete (data as Record<string, unknown>).generatedAt;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing operations array", () => {
    const data = validOperationsMap();
    delete (data as Record<string, unknown>).operations;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing flows array", () => {
    const data = validOperationsMap();
    delete (data as Record<string, unknown>).flows;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing dependencies array", () => {
    const data = validOperationsMap();
    delete (data as Record<string, unknown>).dependencies;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing metadata", () => {
    const data = validOperationsMap();
    delete (data as Record<string, unknown>).metadata;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects operation with empty id", () => {
    const data = validOperationsMap();
    data.operations[0].id = "";
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects operation with empty name", () => {
    const data = validOperationsMap();
    data.operations[0].name = "";
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects negative metadata values", () => {
    const data = validOperationsMap();
    data.metadata.totalOperations = -1;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("validates empty arrays for operations, flows, and dependencies", () => {
    const data = {
      projectId: "proj-empty",
      generatedAt: "2026-02-24T00:00:00Z",
      operations: [],
      flows: [],
      dependencies: [],
      metadata: {
        totalOperations: 0,
        totalFlows: 0,
        criticalFlows: 0,
        maxDependencyDepth: 0,
      },
    };
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects flow with missing criticalPath boolean", () => {
    const data = validOperationsMap();
    delete (data.flows[0] as Record<string, unknown>).criticalPath;
    const result = OperationsMapSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
