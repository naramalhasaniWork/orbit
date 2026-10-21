import { billingWorkspaceId } from "@/lib/billing/workspace-header";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, handleApiError } from "@/lib/utils/api";
import { checkUsageAlerts } from "@/services/billing/usage-alerts";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

interface AgentBreakdown {
  agent: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  avgCostPerCall: number;
}

interface ModelBreakdown {
  model: string;
  calls: number;
  cost: number;
  percentage: number;
}

interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  cost: number;
  calls: number;
}

interface DailySpend {
  date: string;
  cost: number;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.view"
    );

    const params = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams)
    );

    const days = params.period === "7d" ? 7 : params.period === "90d" ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [agentData, modelData, projectData, dailyData, workspace] =
      await Promise.all([
        getAgentBreakdown(ctx.workspaceId, startDate),
        getModelBreakdown(ctx.workspaceId, startDate),
        getProjectBreakdown(ctx.workspaceId, startDate),
        getDailySpend(ctx.workspaceId, days),
        prisma.workspace.findUniqueOrThrow({
          where: { id: ctx.workspaceId },
          select: { creditBalance: true, creditsGranted: true, creditsCurrent: true },
        }),
      ]);

    // Alerts are advisory; never fail the analytics response over them
    const alerts = await checkUsageAlerts(ctx.workspaceId).catch((error) => {
      console.warn("[billing] Usage alerts unavailable:", error);
      return [];
    });

    const totalSpend = agentData.reduce((sum, a) => sum + a.cost, 0);
    const totalCalls = agentData.reduce((sum, a) => sum + a.calls, 0);

    return apiSuccess({
      period: params.period,
      totalSpend,
      totalCalls,
      creditBalance: workspace.creditBalance,
      monthlyCredits: workspace.creditsGranted, // this period's grant from the buckets, not the plan allowance
      creditsCurrent: workspace.creditsCurrent,
      agents: agentData,
      models: modelData,
      projects: projectData.slice(0, 5),
      daily: dailyData,
      alerts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getAgentBreakdown(
  workspaceId: string,
  startDate: Date
): Promise<AgentBreakdown[]> {
  const groups = await prisma.tokenUsage.groupBy({
    by: ["agentPhase"],
    where: { workspaceId, createdAt: { gte: startDate } },
    _sum: { inputTokens: true, outputTokens: true, cost: true },
    _count: true,
  });

  return groups.map((g) => {
    const cost = Number(g._sum.cost ?? 0);
    const calls = g._count;
    return {
      agent: g.agentPhase,
      calls,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      cost,
      avgCostPerCall: calls > 0 ? cost / calls : 0,
    };
  });
}

async function getModelBreakdown(
  workspaceId: string,
  startDate: Date
): Promise<ModelBreakdown[]> {
  const groups = await prisma.tokenUsage.groupBy({
    by: ["model"],
    where: { workspaceId, createdAt: { gte: startDate } },
    _sum: { cost: true },
    _count: true,
  });

  const totalCost = groups.reduce((s, g) => s + Number(g._sum.cost ?? 0), 0);

  return groups
    .map((g) => {
      const cost = Number(g._sum.cost ?? 0);
      return {
        model: g.model,
        calls: g._count,
        cost,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

async function getProjectBreakdown(
  workspaceId: string,
  startDate: Date
): Promise<ProjectBreakdown[]> {
  const groups = await prisma.tokenUsage.groupBy({
    by: ["projectId"],
    where: {
      workspaceId,
      createdAt: { gte: startDate },
      projectId: { not: null },
    },
    _sum: { cost: true },
    _count: true,
  });

  const projectIds = groups
    .map((g) => g.projectId)
    .filter((id): id is string => id !== null);

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(projects.map((p) => [p.id, p.name]));

  return groups
    .map((g) => ({
      projectId: g.projectId ?? "",
      projectName: nameMap.get(g.projectId ?? "") ?? "Unknown",
      cost: Number(g._sum.cost ?? 0),
      calls: g._count,
    }))
    .sort((a, b) => b.cost - a.cost);
}

async function getDailySpend(
  workspaceId: string,
  days: number
): Promise<DailySpend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const records = await prisma.tokenUsage.findMany({
    where: { workspaceId, createdAt: { gte: startDate } },
    select: { cost: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dailyMap = new Map<string, number>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dailyMap.set(d.toISOString().split("T")[0], 0);
  }

  for (const r of records) {
    const key = r.createdAt.toISOString().split("T")[0];
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(r.cost));
  }

  return Array.from(dailyMap.entries()).map(([date, cost]) => ({
    date,
    cost: Math.round(cost * 1000000) / 1000000,
  }));
}
