import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/utils/api";
import { AgentSettingsList } from "@/components/settings/agent-settings-list";

export default async function AgentSettingsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspaceId = session.workspaceId;
  if (!workspaceId) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Agent Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure model, temperature, and behavior for each AI agent.
        </p>
      </div>
      <AgentSettingsList workspaceId={workspaceId} />
    </div>
  );
}
