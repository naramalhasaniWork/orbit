import { billingWorkspaceId } from "@/lib/billing/workspace-header";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { createCheckoutSession, getOrCreateStripeCustomer } from "@/lib/stripe/checkout";
import { getTierConfig } from "@/lib/stripe/prices";
import type { WorkspaceTier } from "@/lib/auth/tenant";

const checkoutSchema = z.object({
  tier: z.enum(["starter", "professional"]),
  billing: z.enum(["monthly", "annual"]).default("monthly"),
  quantity: z.number().min(1).default(1),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      await billingWorkspaceId(request),
      "billing.manage"
    );

    const body = await request.json();
    const { tier, billing, quantity } = checkoutSchema.parse(body);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        billingEmail: true,
        slug: true,
      },
    });

    const tierConfig = getTierConfig(tier as WorkspaceTier);
    const priceId = billing === "annual"
      ? tierConfig.stripePriceIdAnnual
      : tierConfig.stripePriceIdMonthly;

    if (!priceId) {
      return apiError("Price not configured for this tier", "PRICE_NOT_FOUND", 400);
    }

    // Get or create Stripe customer
    const email = workspace.billingEmail ?? ctx.session.user.email ?? "";
    const customerId = await getOrCreateStripeCustomer(
      email,
      workspace.name,
      workspace.id,
      workspace.stripeCustomerId
    );

    // Store customer ID if newly created
    if (!workspace.stripeCustomerId) {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { stripeCustomerId: customerId, billingEmail: email },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const session = await createCheckoutSession({
      workspaceId: workspace.id,
      customerId,
      priceId,
      quantity,
      successUrl: `${baseUrl}/dashboard/settings/billing?success=true`,
      cancelUrl: `${baseUrl}/dashboard/settings/billing?canceled=true`,
    });

    return apiSuccess({ url: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
