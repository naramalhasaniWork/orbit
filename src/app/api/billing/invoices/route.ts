import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/rbac";
import { apiSuccess, handleApiError } from "@/lib/utils/api";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission(
      request.headers.get("x-workspace-id") ?? "",
      "billing.view"
    );

    const invoices = await prisma.invoice.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        stripeInvoiceId: true,
        amount: true,
        currency: true,
        status: true,
        pdfUrl: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
      },
    });

    return apiSuccess({ invoices });
  } catch (error) {
    return handleApiError(error);
  }
}
