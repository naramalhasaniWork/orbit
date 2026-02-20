import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  apiSuccess,
  apiError,
  handleApiError,
} from "@/lib/utils/api";

const UpdatePolicySchema = z.object({
  provider: z.string().min(1),
  isAllowed: z.boolean().optional(),
  requiredTier: z.string().nullable().optional(),
  maxTemperature: z.number().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    await requireSuperAdmin();

    const { modelId } = await params;
    const body = await request.json();
    const parsed = UpdatePolicySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    const { provider, ...data } = parsed.data;

    const policy = await prisma.globalModelPolicy.upsert({
      where: { model_policy_unique: { modelId, provider } },
      create: { modelId, provider, ...data },
      update: data,
    });

    return apiSuccess(policy);
  } catch (error) {
    return handleApiError(error);
  }
}
