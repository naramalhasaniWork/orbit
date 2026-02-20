import { prisma } from "@/lib/db";
import { createTrackedCompletion } from "@/lib/ai/tracked-completion";
import { getModelForTask } from "@/lib/ai/model-router";

// ============================================================
// Test as Documentation Service
// Generate plain-English behavior specs from test plans
// ============================================================

interface BehaviorSpec {
  journey: string;
  behaviors: BehaviorEntry[];
}

interface BehaviorEntry {
  testCaseId: string;
  testName: string;
  type: string;
  priority: number;
  description: string;
  preconditions: string[];
  steps: string[];
  expectedOutcome: string;
  edgeCases: string[];
}

/**
 * Generate behavior documentation from a test plan.
 * Returns plain-English specs grouped by journey.
 */
export async function generateBehaviorDocs(
  projectId: string,
  planId?: string
): Promise<BehaviorSpec[]> {
  const whereClause: Record<string, unknown> = { projectId };

  if (planId) {
    whereClause.testPlanId = planId;
  } else {
    const activePlan = await prisma.testPlan.findFirst({
      where: { projectId, isActive: true },
      select: { id: true },
    });
    if (!activePlan) return [];
    whereClause.testPlanId = activePlan.id;
  }

  const testCases = await prisma.testCase.findMany({
    where: whereClause,
    orderBy: [{ journey: "asc" }, { priorityScore: "desc" }],
  });

  if (testCases.length === 0) return [];

  const grouped = new Map<string, typeof testCases>();
  for (const tc of testCases) {
    const journey = tc.journey ?? "General";
    const existing = grouped.get(journey);
    if (existing) {
      existing.push(tc);
    } else {
      grouped.set(journey, [tc]);
    }
  }

  const specs: BehaviorSpec[] = [];

  for (const [journey, cases] of Array.from(grouped.entries())) {
    const behaviors: BehaviorEntry[] = cases.map((tc) => ({
      testCaseId: tc.id,
      testName: tc.name,
      type: tc.type,
      priority: tc.priorityScore,
      description: tc.rationale ?? tc.name,
      preconditions: extractPreconditions(tc.steps),
      steps: formatSteps(tc.steps),
      expectedOutcome: extractExpectedOutcome(tc.steps, tc.name),
      edgeCases: Array.isArray(tc.edgeCases)
        ? (tc.edgeCases as string[]).filter((e): e is string => typeof e === "string")
        : [],
    }));

    specs.push({ journey, behaviors });
  }

  return specs;
}

/**
 * Generate an AI-enhanced behavior document for a plan.
 * Uses LLM to produce polished, human-readable documentation.
 */
export async function generateEnhancedDocs(
  projectId: string,
  planId?: string
): Promise<string> {
  const specs = await generateBehaviorDocs(projectId, planId);
  if (specs.length === 0) return "No test cases found to document.";

  const specSummary = specs.map((s) => ({
    journey: s.journey,
    testCount: s.behaviors.length,
    behaviors: s.behaviors.map((b) => ({
      name: b.testName,
      type: b.type,
      steps: b.steps.slice(0, 5),
      edgeCases: b.edgeCases.slice(0, 3),
    })),
  }));

  const model = getModelForTask("report_writing");

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  const result = await createTrackedCompletion(
    {
      model,
      systemPrompt: [
        "You generate clean, well-structured behavior specification documents.",
        "Use clear, non-technical language that stakeholders can understand.",
        "Format as Markdown with journey headings, behavior descriptions, and acceptance criteria.",
        "Use 'Given/When/Then' format for individual behaviors where appropriate.",
        "Be concise. No preamble or meta-commentary.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Generate a behavior specification document from these test plans:\n\n${JSON.stringify(specSummary, null, 2)}`,
        },
      ],
      maxTokens: 4000,
      temperature: 0.3,
    },
    {
      workspaceId: project.workspaceId,
      projectId,
      agentPhase: "reporter",
    }
  );

  return result.content;
}

// ============================================================
// Helpers
// ============================================================

function formatSteps(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((s, i) => {
    if (typeof s === "string") return `${i + 1}. ${s}`;
    if (typeof s === "object" && s !== null) {
      const step = s as { action?: string; description?: string };
      return `${i + 1}. ${step.action ?? step.description ?? JSON.stringify(s)}`;
    }
    return `${i + 1}. ${String(s)}`;
  });
}

function extractPreconditions(steps: unknown): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const first = steps[0];
  if (typeof first === "string" && first.toLowerCase().includes("navigate")) {
    return [first];
  }
  if (typeof first === "object" && first !== null) {
    const step = first as { action?: string };
    if (step.action?.toLowerCase().includes("navigate")) {
      return [step.action];
    }
  }
  return [];
}

function extractExpectedOutcome(steps: unknown, testName: string): string {
  if (!Array.isArray(steps) || steps.length === 0) {
    return `The ${testName} should complete successfully`;
  }
  const last = steps[steps.length - 1];
  if (typeof last === "string") return last;
  if (typeof last === "object" && last !== null) {
    const step = last as { action?: string; assertion?: string };
    return step.assertion ?? step.action ?? `The ${testName} should complete successfully`;
  }
  return `The ${testName} should complete successfully`;
}
