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

const MAX_SLUG_ATTEMPTS = 5;

export async function GET() {
  try {
    const session = await requireAuth();

    // Return all workspaces the user belongs to
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id, workspace: { deletedAt: null } },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            creditBalance: true,
            createdAt: true,
            // The first connected GitHub account gives the workspace its mark
            githubInstallations: {
              where: { avatarUrl: { not: null } },
              select: { avatarUrl: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const workspaces = memberships.map(({ workspace: { githubInstallations, ...workspace }, role, id }) => ({
      ...workspace,
      image: githubInstallations[0]?.avatarUrl ?? null,
      role,
      memberId: id,
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

    // Workspace and owner membership are created in one statement so a failure
    // can never leave an ownerless workspace; a slug collision retries with a new suffix.
    let workspace;
    for (let attempt = 1; ; attempt++) {
      try {
        workspace = await prisma.workspace.create({
          data: {
            name: name.trim(),
            slug: generateSlug(name),
            members: { create: { userId: session.user.id, role: "owner" } },
          },
        });
        break;
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code !== "P2002" || attempt >= MAX_SLUG_ATTEMPTS) throw error;
      }
    }

    return apiSuccess(workspace, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
