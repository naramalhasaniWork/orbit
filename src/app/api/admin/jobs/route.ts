import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";

const QuerySchema = z.object({
  status: z.enum(["open", "retried", "discarded"]).default("open"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Dead-letter queue: jobs that exhausted their BullMQ attempts. */
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiError("Invalid query", "VALIDATION_ERROR", 400);
    const { status, page, limit } = parsed.data;

    const [failures, total] = await Promise.all([
      prisma.jobFailure.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jobFailure.count({ where: { status } }),
    ]);
    return apiSuccess({ failures, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}
