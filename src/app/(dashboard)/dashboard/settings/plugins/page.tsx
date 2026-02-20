import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/utils/api";
import { PluginSettings } from "@/components/settings/plugin-settings";

export default async function PluginsSettingsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspaceId = session.workspaceId;
  if (!workspaceId) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Plugins</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage plugins that extend Orbit with notifications, CI integrations, and custom hooks.
        </p>
      </div>
      <PluginSettings workspaceId={workspaceId} />
    </div>
  );
}
