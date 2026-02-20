import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const environments = await prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return apiSuccess(environments);
  } catch (error) {
    return handleApiError(error);
  }
}

const ENVIRONMENT_TYPES = ["staging", "preview", "qa", "production"] as const;

const CreateEnvironmentSchema = z.object({
  name: z.string().min(1, "Environment name is required").max(100),
  type: z.enum(ENVIRONMENT_TYPES).optional().default("staging"),
  url: z.string().url("Must be a valid URL").optional(),
  baseUrl: z.string().url("Must be a valid URL").optional(),
  teardownHookUrl: z.string().url().optional(),
  isDefault: z.boolean().optional().default(false),
}).refine(
  (data) => data.url || data.baseUrl,
  { message: "Environment URL is required (url or baseUrl)", path: ["url"] }
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const parsed = CreateEnvironmentSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const { name, type, url, baseUrl, teardownHookUrl, isDefault } = parsed.data;
    const resolvedUrl = url ?? baseUrl!;

    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: name.trim(),
        type,
        url: resolvedUrl,
        teardownHookUrl,
        isDefault,
      },
    });

    return apiSuccess(environment, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
