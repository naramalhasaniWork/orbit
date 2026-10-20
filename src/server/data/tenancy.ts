/**
 * Who owns each row. One table drives both the scoped clients (scope.ts injects the filter)
 * and the tenantGuard backstop (tenant-guard.ts checks the filter is there). A model that is
 * neither here nor in GLOBAL_MODELS fails tenancy.test.ts, so a new table cannot slip past.
 */

type Where = Record<string, unknown>;

export interface Ownership {
  /** A where/data key that proves the query is tenant-bound (any one, with a defined value). */
  keys: readonly string[];
  /** Filter added inside a workspace scope. */
  inWorkspace: (workspaceId: string) => Where;
  /** Filter added inside a project scope. */
  inProject: (projectId: string, workspaceId: string) => Where;
  /** Scalar a create gets per scope; absent means creating needs a parent check the scope cannot do. */
  create: { workspace?: "workspaceId"; project?: "workspaceId" | "projectId" };
}

/** Rows that carry workspaceId. */
function workspaceOwned(extraKeys: readonly string[] = []): Ownership {
  return {
    keys: ["workspaceId", "workspace", ...extraKeys],
    inWorkspace: (workspaceId) => ({ workspaceId }),
    inProject: (_projectId, workspaceId) => ({ workspaceId }),
    create: { workspace: "workspaceId", project: "workspaceId" },
  };
}

/** Rows that carry projectId; a workspace scope reaches them through the project relation. */
function projectOwned(viaRun = false): Ownership {
  return {
    keys: viaRun ? ["projectId", "runId", "testRun"] : ["projectId", "project"],
    inWorkspace: (workspaceId) =>
      viaRun ? { testRun: { project: { workspaceId } } } : { project: { workspaceId } },
    inProject: (projectId) => ({ projectId }),
    create: { project: "projectId" },
  };
}

/** Rows owned through a project-owned parent (a result through its run). Created by the engine only. */
function childOf(relation: string, foreignKey: string): Ownership {
  return {
    keys: [foreignKey, relation],
    inWorkspace: (workspaceId) => ({ [relation]: { project: { workspaceId } } }),
    inProject: (projectId) => ({ [relation]: { projectId } }),
    create: {},
  };
}

/** Keyed by Prisma model name (what $extends reports); scope.ts maps delegate names to these. */
export const TENANCY: Readonly<Record<string, Ownership>> = {
  Project: {
    keys: ["workspaceId", "workspace"],
    inWorkspace: (workspaceId) => ({ workspaceId }),
    inProject: (projectId, workspaceId) => ({ id: projectId, workspaceId }),
    create: { workspace: "workspaceId" },
  },

  WorkspaceMember: workspaceOwned(["userId"]),
  WorkspaceInvitation: workspaceOwned(),
  WorkspaceUsage: workspaceOwned(),
  GitHubInstallation: workspaceOwned(),
  AuditLog: workspaceOwned(),
  ApiKey: workspaceOwned(),
  CreditTransaction: workspaceOwned(),
  Subscription: workspaceOwned(),
  TokenUsage: workspaceOwned(),
  AgentConfig: workspaceOwned(),
  Invoice: workspaceOwned(),
  IntegrationConfig: workspaceOwned(),
  PreviewConnection: workspaceOwned(),
  PluginInstallation: workspaceOwned(),
  DomainKnowledgeFile: workspaceOwned(),
  KnowledgeChunk: workspaceOwned(),
  WebhookEndpoint: workspaceOwned(),
  ProviderConfig: workspaceOwned(),
  McpConnection: workspaceOwned(),
  PromptVersion: workspaceOwned(),

  ScheduledRun: projectOwned(),
  Environment: projectOwned(),
  Secret: projectOwned(),
  SystemMapNode: projectOwned(),
  SystemMapEdge: projectOwned(),
  TestPlan: projectOwned(),
  TestCase: projectOwned(),
  TestRun: projectOwned(),
  TestScript: projectOwned(),
  FlakyTest: projectOwned(),
  SelectorMapping: projectOwned(),
  WebhookDelivery: projectOwned(),
  WebhookEvent: projectOwned(),
  PreviewBinding: projectOwned(),
  PreviewDeployment: projectOwned(),
  RunArtifact: projectOwned(),
  SelectorHistory: projectOwned(),
  FailurePattern: projectOwned(),
  BaselineSnapshot: projectOwned(),
  ProjectNote: projectOwned(),
  AuditResult: projectOwned(),
  Conversation: projectOwned(),
  AgentExecutionTrace: projectOwned(true),

  TestResult: childOf("testRun", "testRunId"),
  TestCaseVersion: childOf("testCase", "testCaseId"),
  Message: childOf("conversation", "conversationId"),
};

/** Tables with no tenant: the tenant roots, auth, billing events and platform config. */
export const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  "Workspace",
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "StripeWebhookEvent",
  "SystemConfig",
  "PlatformMetrics",
  "EmbeddingConfig",
  "ModelRegistry",
  "GlobalModelPolicy",
  "JobFailure",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

/** Delegate name (testRun) to model name (TestRun). */
export const modelOf = (delegate: string) => delegate.charAt(0).toUpperCase() + delegate.slice(1);

export const isWhereOp = (operation: string) => WHERE_OPS.has(operation);
export const isCreateOp = (operation: string) => CREATE_OPS.has(operation);

function isRecord(value: unknown): value is Where {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the where (or one of its AND terms) filters on an owner key with a defined value. */
export function hasOwnerFilter(where: unknown, keys: readonly string[]): boolean {
  if (!isRecord(where)) return false;
  if (keys.some((key) => where[key] !== undefined && where[key] !== null)) return true;
  const and = where.AND;
  return (Array.isArray(and) ? and : [and]).some((term) => hasOwnerFilter(term, keys));
}

/**
 * Why a query on a tenant model is unsafe, or null when it is fine. Pure, so the guard
 * extension, the test doubles and the unit test all share it.
 */
export function findTenantViolation(model: string | undefined, operation: string, args: unknown): string | null {
  const owner = model ? TENANCY[model] : undefined;
  if (!owner) return null;
  const a = isRecord(args) ? args : {};

  if (isWhereOp(operation) && !hasOwnerFilter(a.where, owner.keys)) {
    return `${model}.${operation} has no tenant filter (one of ${owner.keys.join(", ")})`;
  }
  if (operation === "upsert" && !(hasOwnerFilter(a.where, owner.keys) && hasOwnerFilter(a.create, owner.keys))) {
    return `${model}.upsert needs a tenant filter in where and create`;
  }
  if (isCreateOp(operation)) {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    if (!rows.every((row) => hasOwnerFilter(row, owner.keys))) {
      return `${model}.${operation} sets no owner (one of ${owner.keys.join(", ")})`;
    }
  }
  return null;
}
