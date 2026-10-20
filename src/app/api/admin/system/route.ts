import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";
import {
  FEATURE_FLAG_DEFAULTS,
  getSystemConfig,
  invalidateSystemConfigCache,
  type FeatureFlag,
} from "@/lib/system-config";

export async function GET() {
  try {
    await requireSuperAdmin();
    invalidateSystemConfigCache();
    const config = await getSystemConfig();

    return apiSuccess({
      maintenance_mode: config.maintenanceMode,
      maintenance_message: config.maintenanceMessage,
      system_announcement: config.announcement,
      feature_flags: config.featureFlags,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const flagShape = Object.fromEntries(
  Object.keys(FEATURE_FLAG_DEFAULTS).map((k) => [k, z.boolean()])
) as Record<FeatureFlag, z.ZodBoolean>;

const UpdateConfigSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("maintenance_mode"), value: z.boolean() }),
  z.object({ key: z.literal("maintenance_message"), value: z.string().max(500) }),
  z.object({ key: z.literal("system_announcement"), value: z.string().max(500) }),
  z.object({ key: z.literal("feature_flags"), value: z.object(flagShape).partial().strict() }),
]);

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSuperAdmin();

    const body = await request.json();
    const parsed = UpdateConfigSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    const { key, value } = parsed.data;

    const config = await prisma.systemConfig.upsert({
      where: { key },
      create: {
        key,
        value: value as never,
        updatedBy: session.user.id,
      },
      update: {
        value: value as never,
        updatedBy: session.user.id,
      },
    });

    invalidateSystemConfigCache();

    // Log system config change
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
    });

    if (membership) {
      await prisma.auditLog.create({
        data: {
          workspaceId: membership.workspaceId,
          userId: session.user.id,
          action: "admin.system.config_change",
          resourceType: "system_config",
          resourceId: config.id,
          metadata: { key, value } as Prisma.InputJsonValue,
        },
      });
    }

    return apiSuccess(config);
  } catch (error) {
    return handleApiError(error);
  }
}
