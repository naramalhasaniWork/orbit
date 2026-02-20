import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/utils/api";
import { ProviderSettings } from "@/components/settings/provider-settings";

export default async function ProvidersSettingsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspaceId = session.workspaceId;
  if (!workspaceId) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">API Providers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI model providers and API keys for your workspace.
        </p>
      </div>
      <ProviderSettings workspaceId={workspaceId} />
    </div>
  );
}
