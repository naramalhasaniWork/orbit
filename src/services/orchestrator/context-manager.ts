import { prisma } from "@/lib/db";
import { pickDefaultEnvironment } from "@/services/execution/default-environment";
import { search } from "@/server/ai/search";
import type { AgentPhase } from "@/server/ai/types";

interface RetrievedNode {
  id: string;
  type: string;
  name: string;
  filePath: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// Node type filters per agent — each agent gets the context most relevant to it
const AGENT_NODE_FILTERS: Record<AgentPhase, string[] | null> = {
  analyst: null, // Analyst sees everything (it builds the map)
  planner: ["route", "endpoint", "component", "auth_strategy"],
  executor: ["route", "endpoint", "component"],
  reporter: ["route", "endpoint"],
  auditor: null,
};

const AGENT_TOP_K: Record<AgentPhase, number> = {
  analyst: 20,
  planner: 30,
  executor: 15,
  reporter: 10,
  auditor: 8000,
};

/**
 * Retrieve context for a specific agent phase.
 * Applies node-type filters and appropriate topK limits.
 */
export async function retrieveAgentContext(
  projectId: string,
  agent: AgentPhase,
  query: string
): Promise<RetrievedNode[]> {
  const topK = AGENT_TOP_K[agent];
  const typeFilter = AGENT_NODE_FILTERS[agent];

  const nodes = await retrieveRelevantNodes(projectId, query, topK);

  if (!typeFilter) return nodes;
  return nodes.filter((n) => typeFilter.includes(n.type));
}

/**
 * Retrieval via search.semantic: pgvector similarity, or keyword match without embeddings.
 */
export async function retrieveRelevantNodes(
  projectId: string,
  query: string,
  topK = 10
): Promise<RetrievedNode[]> {
  const results = await search.semantic(projectId, query, topK);
  return results.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    filePath: r.file_path,
    metadata: {} as Record<string, unknown>,
    similarity: Number(r.similarity),
  }));
}

/**
 * Get previous run patterns for agent memory.
 * Agents can reference this to detect trends (e.g., persistent flaky tests).
 */
export async function getAgentMemory(projectId: string, lookback = 5) {
  const recentRuns = await prisma.testRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { completedAt: "desc" },
    take: lookback,
    select: {
      id: true,
      mode: true,
      passed: true,
      failed: true,
      flaky: true,
      totalTests: true,
      completedAt: true,
    },
  });

  const flakyTests = await prisma.flakyTest.findMany({
    where: { projectId },
    include: { testCase: { select: { name: true, journey: true } } },
    orderBy: { occurrences: "desc" },
    take: 10,
  });

  const selectorHealings = await prisma.selectorMapping.findMany({
    where: { projectId },
    orderBy: { healCount: "desc" },
    take: 10,
    select: { originalSelector: true, healedSelector: true, healCount: true },
  });

  return {
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      mode: r.mode,
      passed: r.passed,
      failed: r.failed,
      flaky: r.flaky,
      total: r.totalTests,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
    flakyPatterns: flakyTests.map((f) => ({
      testName: f.testCase.name,
      journey: f.testCase.journey,
      occurrences: f.occurrences,
      passRate: f.passRate,
      isQuarantined: f.isQuarantined,
    })),
    selectorHealings: selectorHealings.map((s) => ({
      original: s.originalSelector,
      healed: s.healedSelector,
      healCount: s.healCount,
    })),
  };
}

export async function getProjectContext(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      environments: true,
      workspace: { select: { settings: true } },
    },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const nodeCount = await prisma.systemMapNode.count({ where: { projectId } });
  const edgeCount = await prisma.systemMapEdge.count({ where: { projectId } });

  const activePlan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true },
    orderBy: { version: "desc" },
    include: { _count: { select: { testCases: true } } },
  });

  const lastRun = await prisma.testRun.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const workspaceSettings = (project.workspace?.settings ?? {}) as Record<string, unknown>;
  const customPrompt = typeof workspaceSettings.customPrompt === "string"
    ? workspaceSettings.customPrompt
    : undefined;

  return {
    project,
    defaultEnvironment: pickDefaultEnvironment(project.environments),
    systemMapStats: { nodes: nodeCount, edges: edgeCount },
    activePlan: activePlan
      ? { id: activePlan.id, version: activePlan.version, testCaseCount: activePlan._count.testCases }
      : null,
    lastRun: lastRun
      ? { id: lastRun.id, status: lastRun.status, passed: lastRun.passed, failed: lastRun.failed }
      : null,
    customPrompt,
  };
}

export type { RetrievedNode };
