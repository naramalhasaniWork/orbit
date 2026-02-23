import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TestPlan, TestCase } from "@/generated/prisma/client";
import type { TestCase as GeneratedTestCase } from "@/agents/schemas/test-plan";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

interface CachedPlan {
  plan: TestPlan;
  testCases: TestCase[];
}

export async function getActivePlan(projectId: string): Promise<CachedPlan | null> {
  const plan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true },
    include: { testCases: { orderBy: { priorityScore: "desc" } } },
    orderBy: { version: "desc" },
  });

  if (!plan) return null;

  return {
    plan,
    testCases: plan.testCases,
  };
}

export async function getNextVersion(projectId: string): Promise<number> {
  const latest = await prisma.testPlan.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return (latest?.version ?? 0) + 1;
}

export async function deactivateExistingPlans(projectId: string): Promise<void> {
  await prisma.testPlan.updateMany({
    where: { projectId, isActive: true },
    data: { isActive: false },
  });
}

export async function storePlan(
  projectId: string,
  version: number,
  testCases: GeneratedTestCase[],
  summary: Record<string, unknown>
): Promise<CachedPlan> {
  // Deactivate old plans, then create new one with test cases in a transaction
  const result = await prisma.$transaction(async (tx) => {
    await tx.testPlan.updateMany({
      where: { projectId, isActive: true },
      data: { isActive: false },
    });

    const plan = await tx.testPlan.create({
      data: {
        projectId,
        version,
        isActive: true,
        generatedBy: "planner",
        summary: toJsonValue(summary),
      },
    });

    await tx.testCase.createMany({
      data: testCases.map((tc) => ({
        testPlanId: plan.id,
        projectId,
        name: tc.name,
        type: tc.type,
        journey: tc.journey,
        priorityScore: tc.priorityScore,
        criticality: tc.criticality,
        risk: tc.risk,
        coverageGap: tc.coverageGap,
        steps: toJsonValue(tc.steps),
        rationale: tc.rationale,
        edgeCases: toJsonValue(tc.edgeCases),
        isCritical: tc.priorityScore >= 80,
      })),
    });

    const testCaseRecords = await tx.testCase.findMany({
      where: { testPlanId: plan.id },
      orderBy: { priorityScore: "desc" },
    });

    return { plan, testCases: testCaseRecords };
  });

  return result;
}

export async function getPlanHistory(
  projectId: string,
  limit = 10
): Promise<Array<Pick<TestPlan, "id" | "version" | "isActive" | "createdAt">>> {
  return prisma.testPlan.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    take: limit,
    select: {
      id: true,
      version: true,
      isActive: true,
      createdAt: true,
    },
  });
}
