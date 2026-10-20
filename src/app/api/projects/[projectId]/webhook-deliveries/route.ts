import { apiSuccess } from "@/lib/utils/api";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/projects/[projectId]/webhook-deliveries — List deliveries
// ============================================================

export const GET = route({}, async ({ req: request, params: { projectId }, db }) => {
  const project = await db.project(projectId);

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const event = url.searchParams.get("event");

  const deliveries = await project.db.webhookDelivery.findMany({
    where: event ? { event } : {},
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

  const stats = await project.db.webhookDelivery.groupBy({
    by: ["event"],
    _count: { id: true },
  });

  return apiSuccess({
    deliveries,
    stats: stats.map((s) => ({ event: s.event, count: s._count.id })),
  });
});
