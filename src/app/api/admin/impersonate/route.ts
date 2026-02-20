import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

const ImpersonateSchema = z.object({
  workspaceId: z.string().uuid(),
});

const StopSchema = z.object({
  action: z.literal("stop"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();

    // Check if stopping impersonation
    const stopParsed = StopSchema.safeParse(body);
    if (stopParsed.success) {
      return apiSuccess({ impersonating: false });
    }

    // Start impersonation
    const parsed = ImpersonateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    const { workspaceId } = parsed.data;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true },
    });

    if (!workspace) {
      return apiError("Workspace not found", "NOT_FOUND", 404);
    }

    // Log impersonation in audit log
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
    });

    if (membership) {
      await prisma.auditLog.create({
        data: {
          workspaceId: membership.workspaceId,
          userId: session.user.id,
          action: "admin.impersonate.start",
          resourceType: "workspace",
          resourceId: workspaceId,
          metadata: {
            targetWorkspace: workspace.name,
            targetWorkspaceSlug: workspace.slug,
          },
        },
      });
    }

    return apiSuccess({
      impersonating: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
