import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ModelsClient } from "@/components/admin/models-client";

export default async function AdminModelsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [models, total, providers] = await Promise.all([
    prisma.modelRegistry.findMany({
      orderBy: { displayName: "asc" },
      take: 50,
    }),
    prisma.modelRegistry.count(),
    prisma.modelRegistry.findMany({
      select: { provider: true },
      distinct: ["provider"],
      orderBy: { provider: "asc" },
    }),
  ]);

  // Get policies
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

  return (
    <ModelsClient
      initialModels={JSON.parse(JSON.stringify(enriched))}
      initialTotal={total}
      initialProviders={providers.map((p) => p.provider)}
    />
  );
}
