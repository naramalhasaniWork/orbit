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

const DEFAULT_CONFIG: Record<string, unknown> = {
  maintenance_mode: false,
  maintenance_message: "",
  system_announcement: "",
  feature_flags: {
    self_healing: true,
    ai_suggestions: true,
    parallel_execution: true,
    visual_regression: false,
    plugin_marketplace: false,
  },
  rate_limits: {
    runs_per_hour: 50,
    api_requests_per_minute: 100,
    concurrent_runs: 5,
  },
};

export async function GET() {
  try {
    await requireSuperAdmin();

    const configs = await prisma.systemConfig.findMany();

    const configMap: Record<string, unknown> = { ...DEFAULT_CONFIG };
    for (const c of configs) {
      configMap[c.key] = c.value;
    }

    return apiSuccess(configMap);
  } catch (error) {
    return handleApiError(error);
  }
}

const UpdateConfigSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

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
