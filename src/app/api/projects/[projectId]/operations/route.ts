import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

interface OperationsMapData {
  operations: Array<{
    id: string;
    name: string;
    type: string;
    nodeIds: string[];
  }>;
  flows: Array<{
    id: string;
    name: string;
    description: string;
    operations: string[];
    criticalPath: boolean;
  }>;
  dependencies: Array<{
    operationId: string;
    dependsOn: string[];
  }>;
}

const EMPTY_MAP: OperationsMapData = {
  operations: [],
  flows: [],
  dependencies: [],
};

export const GET = route({}, async ({ params: { projectId }, workspaceId, db }) => {
  const project = await db.project(projectId);

  // Extract operations map from the latest active test plan summary
  const plan = await project.testPlan.findFirst({
    where: { projectId, isActive: true, deletedAt: null },
    orderBy: { version: "desc" },
    select: { id: true, summary: true, version: true, createdAt: true },
  });

  if (!plan?.summary) {
    return apiSuccess({ planId: null, ...EMPTY_MAP });
  }

  const summary = plan.summary as Record<string, unknown>;
  const opsMap = summary.operationsMap as OperationsMapData | undefined;

  if (!opsMap || !Array.isArray(opsMap.operations)) {
    return apiSuccess({ planId: plan.id, ...EMPTY_MAP });
  }

  return apiSuccess({
    planId: plan.id,
    planVersion: plan.version,
    generatedAt: plan.createdAt,
    operations: opsMap.operations ?? [],
    flows: opsMap.flows ?? [],
    dependencies: opsMap.dependencies ?? [],
  });
});
