import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/webhook-deliveries — List deliveries
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const event = url.searchParams.get("event");

  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      projectId,
      ...(event ? { event } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      event: true,
      url: true,
      statusCode: true,
      attempts: true,
      deliveredAt: true,
      createdAt: true,
      response: true,
    },
  });

  const stats = await prisma.webhookDelivery.groupBy({
    by: ["event"],
    where: { projectId },
    _count: { id: true },
  });

  return apiSuccess({
    deliveries,
    stats: stats.map((s) => ({ event: s.event, count: s._count.id })),
  });
});
