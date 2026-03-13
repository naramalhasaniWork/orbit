import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import {
  getModelForTask,
  getAgentConfig,
  getMaxOutputTokensForModel,
  computeMaxTestCasesForTokenBudget,
} from "@/lib/ai/model-router";
import { buildPlannerPrompt, type PlannerContext } from "@/agents/prompts/planner-prompt";
import { loadUserLayerForProject, getWorkspaceName, loadTestingNotes } from "@/agents/prompts/context-loader";
import { TestPlanSchema, type TestCase } from "@/agents/schemas/test-plan";
import { prisma } from "@/lib/db";
import type { CoverageReport } from "@/services/planning/coverage-analyzer";
import type { Journey } from "@/services/planning/journey-reconstructor";
import { spawnSubAgent, type SubAgentResult } from "@/services/agents/executor";
import { parseLlmJson } from "@/lib/utils/json-parse";
import type { OperationsMap } from "@/agents/schemas/operations-map";

interface GenerationInput {
  projectId: string;
  version: number;
  mode: "full" | "smoke" | "regression" | "targeted";
  coverageReport: CoverageReport;
  journeys: Journey[];
  focusAreas?: string[];
  excludePaths?: string[];
  maxTestCases?: number;
  operationsMap?: OperationsMap;
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
      select: { framework: true, workspaceId: true },
    }),
    prisma.systemMapNode.findMany({ where: { projectId } }),
    prisma.systemMapEdge.findMany({ where: { projectId } }),
  ]);

  return {
    workspaceId: project.workspaceId,
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

async function loadFailurePatterns(
  projectId: string
): Promise<Array<{ pattern: string; category: string; occurrences: number }>> {
  const patterns = await prisma.failurePattern.findMany({
    where: { projectId },
    orderBy: { occurrences: "desc" },
    take: 10,
    select: { pattern: true, category: true, occurrences: true },
  });

  return patterns;
}

const COMPLEX_JOURNEY_THRESHOLD = 5;

interface JourneyAnalysis {
  journeyName: string;
  result: SubAgentResult;
}

/**
 * Checks if a journey is complex (>5 nodes) and spawns a journey-analyzer
 * sub-agent to break it down into testable scenarios with edge cases.
 * Returns analysis results for complex journeys, empty array for simple ones.
 */
async function analyzeComplexJourneys(
  journeys: Journey[],
  systemMap: { framework: string; nodes: Array<{ id: string; type: string; name: string; filePath: string; metadata: Record<string, unknown> }>; edges: Array<{ source: string; target: string; relationship: string }>; workspaceId: string },
  projectId: string,
  existingTestNames: string[],
  failurePatterns: Array<{ pattern: string; category: string; occurrences: number }>
): Promise<JourneyAnalysis[]> {
  const complexJourneys = journeys.filter(
    (j) => j.nodeIds.length > COMPLEX_JOURNEY_THRESHOLD
  );

  if (complexJourneys.length === 0) return [];

  const analyses = await Promise.all(
    complexJourneys.map(async (journey) => {
      const journeyNodes = systemMap.nodes.filter((n) =>
        journey.nodeIds.includes(n.id)
      );
      const journeyEdges = systemMap.edges.filter(
        (e) =>
          journey.nodeIds.includes(e.source) &&
          journey.nodeIds.includes(e.target)
      );

      const result = await spawnSubAgent({
        parentRunId: `plan-${projectId}-${Date.now()}`,
        projectId,
        agentType: "journey-analyzer",
        workspaceId: systemMap.workspaceId,
        context: {
          journeyName: journey.name,
          journeyDescription: journey.description,
          nodes: journeyNodes,
          edges: journeyEdges,
          framework: systemMap.framework,
          failurePatterns,
          existingTestNames,
        },
      });

      return { journeyName: journey.name, result };
    })
  );

  return analyses.filter((a) => a.result.success);
}

/**
 * Generate visual_regression test cases for every route node in the system map.
 * Marks the first run as baseline capture; subsequent runs compare against it.
 */
function generateVisualRegressionCases(
  systemMap: { nodes: Array<{ id: string; type: string; name: string; filePath: string; metadata: Record<string, unknown> }> },
  existingTestNames: string[]
): TestCase[] {
  const routeNodes = systemMap.nodes.filter((n) => n.type === "route");
  const cases: TestCase[] = [];

  for (const node of routeNodes) {
    const testName = `Visual regression: ${node.name}`;

    // Skip if this visual test already exists
    if (existingTestNames.includes(testName)) continue;

    const routePath = (node.metadata?.path as string) ?? node.name;

    cases.push({
      id: `vr-${node.id.slice(0, 8)}`,
      name: testName,
      type: "visual_regression",
      journey: "visual_identity",
      priorityScore: 40,
      criticality: 30,
      risk: 50,
      coverageGap: 60,
      steps: [
        {
          action: `Navigate to ${routePath}`,
          expected: "Page loads and renders completely",
        },
        {
          action: "Capture full-page screenshot",
          expected: "Screenshot captured and stored as artifact",
        },
        {
          action: "Compare against baseline screenshot",
          expected: "Visual diff within acceptable threshold or baseline captured",
        },
      ],
      rationale: `Monitors visual consistency of ${node.name} route. Detects unintended layout changes, broken styles, and brand violations.`,
      edgeCases: [
        "Different viewport sizes",
        "Dynamic content loading states",
        "Dark/light mode variants",
      ],
    });
  }

  return cases;
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

  const [systemMap, existingTestNames, userLayer, workspaceName, failurePatterns] = await Promise.all([
    loadSystemMapForPrompt(projectId),
    loadExistingTestNames(projectId),
    loadUserLayerForProject(projectId),
    getWorkspaceName(projectId),
    loadFailurePatterns(projectId),
  ]);

  // Analyze complex journeys (>5 nodes) with sub-agent for deeper coverage
  const journeyAnalyses = await analyzeComplexJourneys(
    input.journeys,
    systemMap,
    projectId,
    existingTestNames,
    failurePatterns
  );

  // Inject sub-agent journey analysis into planner context as additional guidance
  const journeyInsights = journeyAnalyses.map((a) => {
    const output = a.result.output as Record<string, unknown>;
    return `[Journey Analysis: ${a.journeyName}]\n${JSON.stringify(output, null, 2)}`;
  });

  // Resolve model → token ceiling → test-case cap in priority order:
  //   1. Workspace AgentConfig (DB) model/maxOutputTokens override
  //   2. MODEL_MAX_OUTPUT_TOKENS[model] (per-model hard ceiling)
  //   3. User-supplied maxTestCases (or derived from token budget)
  const model = await getModelForTask("test_generation", systemMap.workspaceId);
  const agentConfig = await getAgentConfig(systemMap.workspaceId, "planner");
  const effectiveMaxTokens = getMaxOutputTokensForModel(model, agentConfig?.maxOutputTokens);
  const effectiveMaxTestCases = maxTestCases ?? computeMaxTestCasesForTokenBudget(effectiveMaxTokens);

  const testingNotes = await loadTestingNotes(projectId);

  const context: PlannerContext = {
    systemMap,
    userConfig: {
      testMode: mode,
      focusAreas,
      excludePaths,
      maxTestCases: effectiveMaxTestCases,
      priorityJourneys: input.journeys.map((j) => j.name),
    },
    existingTestNames,
    gitHistory: [], // Git history integration deferred to indexing service
    failurePatterns,
    projectId,
    workspaceName,
    operationsMap: input.operationsMap,
    testingNotes: testingNotes.length > 0 ? testingNotes : undefined,
  };

  const prompt = buildPlannerPrompt(context, userLayer);

  // Append journey analysis insights to the prompt if available
  let enrichedPrompt = journeyInsights.length > 0
    ? `${prompt}\n\n## Sub-Agent Journey Analysis\nThe following complex journeys were pre-analyzed by a specialist sub-agent. Use these insights to generate more targeted test cases:\n\n${journeyInsights.join("\n\n")}`
    : prompt;

  // Append operations map if available — enables dependency-aware test ordering
  if (input.operationsMap && input.operationsMap.operations.length > 0) {
    enrichedPrompt = `${enrichedPrompt}\n\n## Operations Map\nThe following operations and dependencies were identified by the Operations Analyst. Use this to:\n- Generate tests that follow operational flow ordering (prerequisite operations first)\n- Create prerequisite-aware test sequences (e.g., "Create Invoice" before "Submit Invoice")\n- Prioritize critical path flows with higher priority scores\n\n${JSON.stringify(input.operationsMap, null, 2)}`;
  }

  const completion = await createTrackedCompletion(
    {
      model,
      systemPrompt: enrichedPrompt,
      messages: [
        {
          role: "user",
          content: `Generate a test plan (version ${version}) for project ${projectId}. Follow the system prompt instructions exactly. Output valid JSON only.`,
        },
      ],
      maxTokens: effectiveMaxTokens,
      temperature: 0.3,
    },
    {
      workspaceId: systemMap.workspaceId,
      projectId,
      agentPhase: "planner",
    }
  );

  const parsed = parseLlmJson(completion.content);
  const validated = TestPlanSchema.parse(parsed);

  // Append visual regression test cases for route nodes
  const visualCases = generateVisualRegressionCases(systemMap, existingTestNames);
  const allTestCases = [...validated.testCases, ...visualCases];

  // metadata may be absent when the response was truncated and recovered —
  // rebuild it from the actual test cases in that case.
  const updatedMetadata = {
    totalTests: allTestCases.length,
    estimatedCredits: validated.metadata?.estimatedCredits ?? allTestCases.length,
    coverageByJourney: validated.metadata?.coverageByJourney ?? {},
    coverageByType: {
      ...(validated.metadata?.coverageByType ?? {}),
      visual_regression: visualCases.length,
    },
  };

  return {
    testCases: allTestCases,
    metadata: updatedMetadata,
    tokensUsed: {
      input: completion.usage.inputTokens,
      output: completion.usage.outputTokens,
    },
  };
}
