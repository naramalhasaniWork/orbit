import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BillingPageClient } from "@/components/billing/billing-page-client";
import { isSelfHosted } from "@/lib/self-host";

export default async function BillingSettingsPage() {
  if (isSelfHosted()) notFound();

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ext = session as { workspaceId?: string };
  if (!ext.workspaceId) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Billing & Usage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription, monitor token costs, and view invoices.
        </p>
      </div>

      <BillingPageClient workspaceId={ext.workspaceId} />
    </div>
  );
}
