import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireAuth,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { generateSlug } from "@/lib/utils/slug";

export async function GET() {
  try {
    const session = await requireAuth();

    // Return all workspaces the user belongs to
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            creditBalance: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      memberId: m.id,
    }));

    return apiSuccess(workspaces);
  } catch (error) {
    return handleApiError(error);
  }
}

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(100),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const body = await request.json();
    const parsed = CreateWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const { name } = parsed.data;
    const slug = generateSlug(name);

    const workspace = await prisma.workspace.create({
      data: { name: name.trim(), slug },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: session.user.id,
        role: "owner",
      },
    });

    return apiSuccess(workspace, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
