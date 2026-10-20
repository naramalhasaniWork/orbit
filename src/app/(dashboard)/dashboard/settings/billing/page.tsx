import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BillingPageClient } from "@/components/billing/billing-page-client";

export default async function BillingSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ext = session as { workspaceId?: string };
  if (!ext.workspaceId) redirect("/login");

  const workspace = await prisma.workspace.findUnique({
    where: { id: ext.workspaceId },
    select: { tier: true },
  });
  if (!workspace) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Billing & Usage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription, monitor token costs, and view invoices.
        </p>
      </div>

      <BillingPageClient workspaceId={ext.workspaceId} currentTier={workspace.tier} />
    </div>
  );
}
