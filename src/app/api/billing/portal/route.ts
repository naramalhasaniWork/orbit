import { billingWorkspaceId } from "@/lib/billing/workspace-header";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { createBillingPortalSession } from "@/lib/stripe/checkout";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.manage"
    );

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { stripeCustomerId: true },
    });

    if (!workspace.stripeCustomerId) {
      return apiError(
        "No billing account found. Subscribe to a plan first.",
        "NO_CUSTOMER",
        400
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const session = await createBillingPortalSession(
      workspace.stripeCustomerId,
      `${baseUrl}/dashboard/settings/billing`
    );

    return apiSuccess({ url: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
