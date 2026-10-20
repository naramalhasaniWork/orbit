import { z } from "zod";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/vault";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const secrets = await prisma.secret.findMany({
    where: { projectId },
    select: { id: true, key: true, environmentId: true, createdAt: true, updatedAt: true },
    orderBy: { key: "asc" },
  });

  return apiSuccess(secrets);
});

const CreateSecretSchema = z.object({
  key: z.string().min(1, "Secret key is required").max(255),
  value: z.string().min(1, "Secret value is required"),
  environmentId: z.string().uuid().optional(),
});

export const POST = route(
  { permission: "secrets.manage" },
  async ({ req: request, params: { projectId }, workspaceId }) => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const parsed = CreateSecretSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    const { key, value, environmentId } = parsed.data;
    const { encrypted, iv } = encrypt(value);

    const existing = await prisma.secret.findFirst({
      where: {
        projectId,
        key,
        environmentId: environmentId ?? null,
      },
    });

    let secret;
    const selectFields = { id: true, key: true, environmentId: true, createdAt: true, updatedAt: true };
    if (existing) {
      secret = await prisma.secret.update({
        where: { id: existing.id },
        data: { encryptedValue: encrypted, iv },
        select: selectFields,
      });
    } else {
      secret = await prisma.secret.create({
        data: { projectId, key, encryptedValue: encrypted, iv, environmentId },
        select: selectFields,
      });
    }

    return apiSuccess(secret, 201);
  }
);
