import { redactSettingsOf } from "@/lib/integrations/redact";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { TIER_LIMITS, type WorkspaceTier } from "@/lib/auth/tenant";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { generateSlug } from "@/lib/utils/slug";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "active";

    const where: Record<string, unknown> = { workspaceId };
    if (status !== "all") {
      where.status = status;
    }

    const projectList = await prisma.project.findMany({
      where,
    });

    return apiSuccess(projectList.map(redactSettingsOf));
  } catch (error) {
    return handleApiError(error);
  }
}

const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  repoUrl: z.string().url("Repository URL must be a valid URL"),
  repoOwner: z.string().min(1, "Repository owner is required"),
  repoName: z.string().min(1, "Repository name is required"),
  defaultBranch: z.string().optional().default("main"),
});

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    // RBAC: require projects.create permission
    await requirePermission(workspaceId, "projects.create");

    // Tier limit check
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { tier: true, projectLimit: true },
    });

    if (workspace) {
      const tier = workspace.tier as WorkspaceTier;
      const limit = TIER_LIMITS[tier]?.projects ?? workspace.projectLimit;
      const currentCount = await prisma.project.count({
        where: { workspaceId, deletedAt: null },
      });

      if (currentCount >= limit) {
        return apiError(
          `Project limit reached (${limit}). Upgrade your plan to create more projects.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    const body = await request.json();
    const parsed = CreateProjectSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const { name, repoUrl, repoOwner, repoName, defaultBranch } = parsed.data;
    const slug = generateSlug(name);

    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: name.trim(),
        slug,
        repoUrl,
        repoOwner,
        repoName,
        defaultBranch,
      },
    });

    return apiSuccess(redactSettingsOf(project), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
