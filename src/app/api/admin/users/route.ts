import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAvatarUrl } from "@/lib/avatar/resolve";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

const SearchParams = z.object({
  search: z.string().optional(),
  role: z.enum(["user", "admin", "super_admin"]).optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  sort: z.enum(["name", "email", "created_at", "role"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin", "super_admin"]),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const url = new URL(request.url);
    const parsed = SearchParams.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiError("Invalid parameters", "VALIDATION_ERROR", 400);
    }

    const { search, role, page, limit, sort, order } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
    };

    const orderBy = {
      [sort === "created_at" ? "createdAt" : sort]: order,
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          avatarKey: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            include: {
              workspace: { select: { id: true, name: true, slug: true } },
            },
          },
          _count: {
            select: { testRuns: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: resolveAvatarUrl(u),
      role: u.role,
      createdAt: u.createdAt,
      lastActive: u.updatedAt,
      workspaces: u.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
      runsTriggered: u._count.testRuns,
    }));

    return apiSuccess({ users: data, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSuperAdmin();

    const body = await request.json();
    const parsed = UpdateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    const { userId, role } = parsed.data;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    // Log role change in audit log
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
    });

    if (membership) {
      await prisma.auditLog.create({
        data: {
          workspaceId: membership.workspaceId,
          userId: session.user.id,
          action: "admin.user.role_change",
          resourceType: "user",
          resourceId: userId,
          metadata: { newRole: role },
        },
      });
    }

    return apiSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}
