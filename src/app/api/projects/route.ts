import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import { generateSlug } from "@/lib/utils/slug";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();

    const projectList = await prisma.project.findMany({
      where: { workspaceId },
    });

    return apiSuccess(projectList);
  } catch (error) {
    return handleApiError(error);
  }
}

interface CreateProjectBody {
  name?: string;
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    const body = (await request.json()) as CreateProjectBody;
    const { name, repoUrl, repoOwner, repoName, defaultBranch } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return apiError("Project name is required", "VALIDATION_ERROR", 400);
    }

    if (!repoUrl || typeof repoUrl !== "string") {
      return apiError("Repository URL is required", "VALIDATION_ERROR", 400);
    }

    if (!repoOwner || typeof repoOwner !== "string") {
      return apiError("Repository owner is required", "VALIDATION_ERROR", 400);
    }

    if (!repoName || typeof repoName !== "string") {
      return apiError("Repository name is required", "VALIDATION_ERROR", 400);
    }

    const slug = generateSlug(name);

    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: name.trim(),
        slug,
        repoUrl,
        repoOwner,
        repoName,
        defaultBranch: defaultBranch || "main",
      },
    });

    return apiSuccess(project, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
