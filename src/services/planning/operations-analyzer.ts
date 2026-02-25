import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask, getAgentConfig, getMaxOutputTokensForModel } from "@/lib/ai/model-router";
import {
  buildOperationsAnalystPrompt,
  type OperationsAnalystContext,
} from "@/agents/prompts/operations-analyst-prompt";
import { loadUserLayerForProject, getWorkspaceName } from "@/agents/prompts/context-loader";
import { OperationsMapSchema, type OperationsMap } from "@/agents/schemas/operations-map";
import { prisma } from "@/lib/db";
import { parseLlmJson } from "@/lib/utils/json-parse";

interface AnalyzerResult {
  operationsMap: OperationsMap;
  tokensUsed: { input: number; output: number };
}

async function loadSystemMapForAnalysis(projectId: string) {
  const [project, nodes, edges] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { framework: true, workspaceId: true },
    }),
    prisma.systemMapNode.findMany({ where: { projectId } }),
    prisma.systemMapEdge.findMany({ where: { projectId } }),
  ]);

  return {
    workspaceId: project.workspaceId,
    framework: project.framework ?? "unknown",
    nodes: nodes.map((n: { id: string; type: string; name: string; filePath: string; metadata: unknown }) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      filePath: n.filePath,
      metadata: n.metadata as Record<string, unknown>,
    })),
    edges: edges.map((e: { sourceNodeId: string; targetNodeId: string; relationship: string }) => ({
      source: e.sourceNodeId,
      target: e.targetNodeId,
      relationship: e.relationship,
    })),
  };
}

/**
 * Validates that all node IDs referenced in operations actually exist
 * in the system map. Strips invalid references to prevent hallucinations.
 */
function validateNodeReferences(
  operationsMap: OperationsMap,
  validNodeIds: Set<string>
): OperationsMap {
  const validOperations = operationsMap.operations.filter((op) => {
    const validNodes = op.nodeIds.filter((id) => validNodeIds.has(id));
    if (validNodes.length === 0) return false;
    op.nodeIds = validNodes;

    if (!validNodeIds.has(op.entryPoint)) {
      op.entryPoint = validNodes[0];
    }
    return true;
  });

  const validOpIds = new Set(validOperations.map((op) => op.id));

  const validFlows = operationsMap.flows
    .map((flow) => ({
      ...flow,
      operations: flow.operations.filter((id) => validOpIds.has(id)),
    }))
    .filter((flow) => flow.operations.length > 0);

  const validDependencies = operationsMap.dependencies
    .filter(
      (dep) =>
        validOpIds.has(dep.operationId) &&
        dep.dependsOn.every((id) => validOpIds.has(id))
    );

  const criticalFlows = validFlows.filter((f) => f.criticalPath).length;
  const maxDepth = computeMaxDependencyDepth(validDependencies);

  return {
    ...operationsMap,
    operations: validOperations,
    flows: validFlows,
    dependencies: validDependencies,
    metadata: {
      totalOperations: validOperations.length,
      totalFlows: validFlows.length,
      criticalFlows,
      maxDependencyDepth: maxDepth,
    },
  };
}

/**
 * Computes the longest dependency chain via DFS.
 */
function computeMaxDependencyDepth(
  dependencies: Array<{ operationId: string; dependsOn: string[] }>
): number {
  const depMap = new Map<string, string[]>();
  for (const dep of dependencies) {
    depMap.set(dep.operationId, dep.dependsOn);
  }

  const memo = new Map<string, number>();

  function depth(opId: string, visited: Set<string>): number {
    if (visited.has(opId)) return 0; // Cycle guard
    if (memo.has(opId)) return memo.get(opId)!;

    visited.add(opId);
    const deps = depMap.get(opId) ?? [];
    let max = 0;
    for (const dep of deps) {
      max = Math.max(max, 1 + depth(dep, visited));
    }
    visited.delete(opId);
    memo.set(opId, max);
    return max;
  }

  let maxDepth = 0;
  for (const opId of Array.from(depMap.keys())) {
    maxDepth = Math.max(maxDepth, depth(opId, new Set<string>()));
  }
  return maxDepth;
}

/**
 * Analyzes a project's system map to infer business operations,
 * operational flows, and dependencies between them.
 */
export async function analyzeOperations(projectId: string): Promise<AnalyzerResult> {
  const [systemMap, userLayer, workspaceName] = await Promise.all([
    loadSystemMapForAnalysis(projectId),
    loadUserLayerForProject(projectId),
    getWorkspaceName(projectId),
  ]);

  if (systemMap.nodes.length === 0) {
    return {
      operationsMap: {
        projectId,
        generatedAt: new Date().toISOString(),
        operations: [],
        flows: [],
        dependencies: [],
        metadata: {
          totalOperations: 0,
          totalFlows: 0,
          criticalFlows: 0,
          maxDependencyDepth: 0,
        },
      },
      tokensUsed: { input: 0, output: 0 },
    };
  }

  const context: OperationsAnalystContext = {
    systemMap,
    projectId,
    workspaceName,
  };

  const prompt = buildOperationsAnalystPrompt(context, userLayer);

  const model = await getModelForTask("test_generation", systemMap.workspaceId);
  const agentConfig = await getAgentConfig(systemMap.workspaceId, "planner");
  const maxTokens = getMaxOutputTokensForModel(model, agentConfig?.maxOutputTokens);

  const completion = await createTrackedCompletion(
    {
      model,
      systemPrompt: prompt,
      messages: [
        {
          role: "user",
          content: `Analyze the system map for project ${projectId} and generate an operations map. Identify all discrete business operations, their dependencies, and operational flows. Output valid JSON only.`,
        },
      ],
      maxTokens,
      temperature: 0.2,
    },
    {
      workspaceId: systemMap.workspaceId,
      projectId,
      agentPhase: "planner",
    }
  );

  const parsed = parseLlmJson(completion.content);
  const validated = OperationsMapSchema.parse(parsed);

  const validNodeIds = new Set<string>(systemMap.nodes.map((n: { id: string }) => n.id));
  const sanitized = validateNodeReferences(validated, validNodeIds);

  return {
    operationsMap: sanitized,
    tokensUsed: {
      input: completion.usage.inputTokens,
      output: completion.usage.outputTokens,
    },
  };
}
