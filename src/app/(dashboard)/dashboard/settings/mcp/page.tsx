import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/utils/api";
import { McpConnections } from "@/components/settings/mcp-connections";

export default async function McpSettingsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspaceId = session.workspaceId;
  if (!workspaceId) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">MCP Tools</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect external MCP servers to give Orbit&apos;s agents access to
          additional tools during test execution.
        </p>
      </div>
      <McpConnections workspaceId={workspaceId} />
    </div>
  );
}
