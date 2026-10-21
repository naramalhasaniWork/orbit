import { billingWorkspaceId } from "@/lib/billing/workspace-header";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { getCreditPackages, createCreditCheckout, getCreditPackageById } from "@/lib/stripe/credits";

const purchaseSchema = z.object({
  packageId: z.string().min(1),
});

/**
 * GET /api/billing/credits
 * Returns current credit balance, monthly allocation, and available packages.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.view"
    );

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: {
        creditBalance: true,
        creditsGranted: true,
        tier: true,
      },
    });

    const packages = getCreditPackages();

    // Get recent credit transactions
    const recentTransactions = await prisma.creditTransaction.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        amount: true,
        balance: true,
        description: true,
        createdAt: true,
      },
    });

    return apiSuccess({
      creditBalance: workspace.creditBalance,
      monthlyCredits: workspace.creditsGranted, // this period's grant from the buckets, not the plan allowance
      tier: workspace.tier,
      packages,
      recentTransactions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/billing/credits
 * Creates a Stripe checkout session for a credit package purchase.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.manage"
    );

    const body = await request.json();
    const { packageId } = purchaseSchema.parse(body);

    const creditPackage = getCreditPackageById(packageId);
    if (!creditPackage) {
      return apiError("Invalid credit package", "INVALID_PACKAGE", 400);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const checkoutUrl = await createCreditCheckout(
      ctx.workspaceId,
      packageId,
      `${baseUrl}/dashboard/settings/billing?credits=success`,
      `${baseUrl}/dashboard/settings/billing?credits=canceled`
    );

    return apiSuccess({ url: checkoutUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
