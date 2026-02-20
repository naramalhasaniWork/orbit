import { createCompletion } from "@/lib/ai";
import { getModelForTask } from "@/lib/ai/model-router";
import { buildPlannerPrompt, type PlannerContext } from "@/agents/prompts/planner-prompt";
import { loadUserLayerForProject, getWorkspaceName } from "@/agents/prompts/context-loader";
import { TestPlanSchema, type TestCase } from "@/agents/schemas/test-plan";
import { prisma } from "@/lib/db";
import type { CoverageReport } from "@/services/planning/coverage-analyzer";
import type { Journey } from "@/services/planning/journey-reconstructor";

interface GenerationInput {
  projectId: string;
  version: number;
  mode: "full" | "smoke" | "regression" | "targeted";
  coverageReport: CoverageReport;
  journeys: Journey[];
  focusAreas?: string[];
  excludePaths?: string[];
  maxTestCases?: number;
}

interface GenerationResult {
  testCases: TestCase[];
  metadata: {
    totalTests: number;
    coverageByJourney: Record<string, number>;
    coverageByType: Record<string, number>;
    estimatedCredits: number;
  };
  tokensUsed: { input: number; output: number };
}

async function loadSystemMapForPrompt(projectId: string) {
  const [project, nodes, edges] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { framework: true },
    }),
    prisma.systemMapNode.findMany({ where: { projectId } }),
    prisma.systemMapEdge.findMany({ where: { projectId } }),
  ]);

  return {
    framework: project.framework ?? "unknown",
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      filePath: n.filePath,
      metadata: n.metadata as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      source: e.sourceNodeId,
      target: e.targetNodeId,
      relationship: e.relationship,
    })),
  };
}

async function loadExistingTestNames(projectId: string): Promise<string[]> {
  const existing = await prisma.testCase.findMany({
    where: {
      projectId,
      isEnabled: true,
      testPlan: { isActive: true },
    },
    select: { name: true },
  });
  return existing.map((tc) => tc.name);
}

function parseJsonResponse(content: string): unknown {
  // Strip markdown code fences if present
  const cleaned = content
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

export async function generateTestCases(input: GenerationInput): Promise<GenerationResult> {
  const {
    projectId,
    version,
    mode,
    focusAreas,
    excludePaths,
    maxTestCases,
  } = input;

  const [systemMap, existingTestNames, userLayer, workspaceName] = await Promise.all([
    loadSystemMapForPrompt(projectId),
    loadExistingTestNames(projectId),
    loadUserLayerForProject(projectId),
    getWorkspaceName(projectId),
  ]);

  const context: PlannerContext = {
    systemMap,
    userConfig: {
      testMode: mode,
      focusAreas,
      excludePaths,
      maxTestCases,
      priorityJourneys: input.journeys.map((j) => j.name),
    },
    existingTestNames,
    gitHistory: [], // Git history integration deferred to indexing service
    projectId,
    workspaceName,
  };

  const prompt = buildPlannerPrompt(context, userLayer);
  const model = getModelForTask("test_generation");

  const completion = await createCompletion({
    model,
    systemPrompt: prompt,
    messages: [
      {
        role: "user",
        content: `Generate a test plan (version ${version}) for project ${projectId}. Follow the system prompt instructions exactly. Output valid JSON only.`,
      },
    ],
    maxTokens: 8192,
    temperature: 0.3,
  });

  const parsed = parseJsonResponse(completion.content);
  const validated = TestPlanSchema.parse(parsed);

  return {
    testCases: validated.testCases,
    metadata: validated.metadata,
    tokensUsed: {
      input: completion.usage.inputTokens,
      output: completion.usage.outputTokens,
    },
  };
}
