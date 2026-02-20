import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/vault";
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

    // Only return key names, never values
    const secrets = await prisma.secret.findMany({
      where: { projectId },
      select: { id: true, key: true, createdAt: true, updatedAt: true },
      orderBy: { key: "asc" },
    });

    return apiSuccess(secrets);
  } catch (error) {
    return handleApiError(error);
  }
}

interface CreateSecretBody {
  key?: string;
  value?: string;
  environmentId?: string;
}

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

    const body = (await request.json()) as CreateSecretBody;
    const { key, value, environmentId } = body;

    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return apiError("Secret key is required", "VALIDATION_ERROR", 400);
    }

    if (!value || typeof value !== "string") {
      return apiError("Secret value is required", "VALIDATION_ERROR", 400);
    }

    const { encrypted, iv } = encrypt(value);

    const existing = await prisma.secret.findFirst({
      where: {
        projectId,
        key,
        environmentId: environmentId ?? { equals: null },
      },
    });

    let secret;
    if (existing) {
      secret = await prisma.secret.update({
        where: { id: existing.id },
        data: { encryptedValue: encrypted, iv },
        select: { id: true, key: true, createdAt: true, updatedAt: true },
      });
    } else {
      secret = await prisma.secret.create({
        data: { projectId, key, encryptedValue: encrypted, iv, environmentId },
        select: { id: true, key: true, createdAt: true, updatedAt: true },
      });
    }

    return apiSuccess(secret, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
