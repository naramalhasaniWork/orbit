import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

const SearchParams = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  sort: z.enum(["name", "created_at", "members", "projects"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const url = new URL(request.url);
    const parsed = SearchParams.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiError("Invalid parameters", "VALIDATION_ERROR", 400);
    }

    const { search, page, limit, sort, order } = parsed.data;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const orderBy =
      sort === "members" || sort === "projects"
        ? { [sort === "members" ? "members" : "projects"]: { _count: order } }
        : { [sort === "created_at" ? "createdAt" : sort]: order };

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: { members: true, projects: true },
          },
          members: {
            where: { role: "owner" },
            take: 1,
            include: { user: { select: { name: true, email: true } } },
          },
        },
      }),
      prisma.workspace.count({ where }),
    ]);

    const data = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      tier: ws.tier,
      creditBalance: ws.creditBalance,
      memberCount: ws._count.members,
      projectCount: ws._count.projects,
      owner: ws.members[0]?.user ?? null,
      deletedAt: ws.deletedAt,
      createdAt: ws.createdAt,
    }));

    return apiSuccess({ workspaces: data, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}
