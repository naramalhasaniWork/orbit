import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";
    const provider = url.searchParams.get("provider") ?? "";
    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = parseInt(url.searchParams.get("limit") ?? "50");

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { modelId: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (provider) {
      where.provider = provider;
    }

    const [models, total] = await Promise.all([
      prisma.modelRegistry.findMany({
        where,
        orderBy: { displayName: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.modelRegistry.count({ where }),
    ]);

    // Get policies for these models
    const modelIds = models.map((m) => m.modelId);
    const policies = await prisma.globalModelPolicy.findMany({
      where: { modelId: { in: modelIds } },
    });
    const policyMap = new Map(
      policies.map((p) => [`${p.provider}:${p.modelId}`, p])
    );

    // Get usage stats (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageStats = await prisma.tokenUsage.groupBy({
      by: ["model"],
      _sum: { inputTokens: true, outputTokens: true },
      _count: true,
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { _sum: { inputTokens: "desc" } },
      take: 50,
    });
    const usageMap = new Map(
      usageStats.map((u) => [
        u.model,
        {
          totalTokens: (u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0),
          calls: u._count,
        },
      ])
    );

    const enriched = models.map((m) => {
      const policy = policyMap.get(`${m.provider}:${m.modelId}`);
      const usage = usageMap.get(m.modelId);
      return {
        ...m,
        policy: policy ?? null,
        usage: usage ?? { totalTokens: 0, calls: 0 },
      };
    });

    // Get distinct providers for filter dropdown
    const providers = await prisma.modelRegistry.findMany({
      select: { provider: true },
      distinct: ["provider"],
      orderBy: { provider: "asc" },
    });

    return apiSuccess({
      models: enriched,
      total,
      page,
      limit,
      providers: providers.map((p) => p.provider),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const CreatePolicySchema = z.object({
  modelId: z.string().min(1),
  provider: z.string().min(1),
  isAllowed: z.boolean(),
  requiredTier: z.string().nullable().optional(),
  maxTemperature: z.number().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const body = await request.json();
    const parsed = CreatePolicySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    const { modelId, provider, ...data } = parsed.data;

    const policy = await prisma.globalModelPolicy.upsert({
      where: { model_policy_unique: { modelId, provider } },
      create: { modelId, provider, ...data },
      update: data,
    });

    return apiSuccess(policy, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
