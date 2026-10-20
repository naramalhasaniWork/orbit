import { redactSettingsOf } from "@/lib/integrations/redact";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canConsume } from "@/lib/auth/tenant";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { generateSlug } from "@/lib/utils/slug";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ req: request, workspaceId }) => {
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
});

const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  repoUrl: z.string().url("Repository URL must be a valid URL"),
  repoOwner: z.string().min(1, "Repository owner is required"),
  repoName: z.string().min(1, "Repository name is required"),
  defaultBranch: z.string().optional().default("main"),
});

export const POST = route(
  { permission: "projects.create" },
  async ({ req: request, workspaceId }) => {
    const allowance = await canConsume(workspaceId, "project");
    if (!allowance.allowed) {
      return apiError(allowance.reason, allowance.code, allowance.code === "NOT_FOUND" ? 404 : 403);
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
  }
);
