import { NextRequest } from "next/server";
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

interface CreateEnvironmentBody {
  name?: string;
  type?: string;
  url?: string;
  baseUrl?: string;
  teardownHookUrl?: string;
  isDefault?: boolean;
}

const VALID_TYPES = new Set(["staging", "preview", "qa", "production"]);

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

    const body = (await request.json()) as CreateEnvironmentBody;
    const { name, type, teardownHookUrl, isDefault } = body;
    const url = body.url ?? body.baseUrl;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return apiError("Environment name is required", "VALIDATION_ERROR", 400);
    }

    if (!url || typeof url !== "string") {
      return apiError("Environment URL is required", "VALIDATION_ERROR", 400);
    }

    if (type && !VALID_TYPES.has(type)) {
      return apiError(
        "Invalid type. Must be: staging, preview, qa, or production",
        "VALIDATION_ERROR",
        400
      );
    }

    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: name.trim(),
        type: (type as "staging" | "preview" | "qa" | "production") ?? "staging",
        url,
        teardownHookUrl,
        isDefault: isDefault ?? false,
      },
    });

    return apiSuccess(environment, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
