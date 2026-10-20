import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { SettingsClient } from "@/components/settings/settings-client";
import { requestOrigin } from "@/lib/setup/access";
import { listConnectionSummaries } from "@/services/preview/connection-service";
import { getIntegration } from "@/server/data/integration-repo";
import { incomingSlackClaims, pendingSlackClaim } from "@/server/data/inbound-repo";
import { parseWorkspaceSettings } from "@/server/data/settings-repo";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  const project = await prisma.project.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });

  let environments: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    isDefault: boolean;
    defaultRunMode: string;
  }> = [];

  let secrets: Array<{
    id: string;
    key: string;
    environmentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  if (project) {
    environments = await prisma.environment.findMany({
      where: { projectId: project.id, archivedAt: null },
      select: { id: true, name: true, type: true, url: true, isDefault: true, defaultRunMode: true },
      orderBy: { createdAt: "asc" },
    });

    secrets = await prisma.secret.findMany({
      where: { projectId: project.id },
      select: { id: true, key: true, environmentId: true, createdAt: true, updatedAt: true },
      orderBy: { key: "asc" },
    });
  }

  const settings = parseWorkspaceSettings(workspace?.settings);
  const [linear, slack, workspaceProjects, slackClaim, slackIncomingClaims] = await Promise.all([
    getIntegration(workspaceId, "linear"),
    getIntegration(workspaceId, "slack"),
    prisma.project.findMany({
      where: { workspaceId, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    pendingSlackClaim(workspaceId),
    incomingSlackClaims(workspaceId),
  ]);

  // Preview providers (Railway, Cloudflare Pages): connection state plus the webhook URL to copy
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? requestOrigin(headers());
  const previewSummaries = await listConnectionSummaries(workspaceId);
  const previewConnections = Object.fromEntries(
    previewSummaries.map((c) => [c.provider, { connection: c, webhookUrl: c.webhookPath ? `${origin}${c.webhookPath}` : null }])
  );

  const integrations = {
    github: settings.github ?? { connected: false },
    linear: linear?.connected
      ? {
          connected: true,
          teamId: linear.externalAccountId ?? undefined,
          teamName: linear.displayName ?? undefined,
          autoCreateIssues: linear.settings.autoCreateIssues,
          hasInboundUrl: linear.hasInboundToken,
          inboundProjectId: linear.settings.inboundProjectId ?? null,
          projects: workspaceProjects,
        }
      : { connected: false },
    slack: slack?.connected
      ? {
          connected: true,
          notifications: slack.settings.notifications,
          teamId: slack.externalAccountId,
          pendingTeamId: slackClaim?.teamId ?? null,
          incomingClaims: slackIncomingClaims,
        }
      : { connected: false },
  };

  return (
    <SettingsClient
      workspace={workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null}
      project={project ? { id: project.id, name: project.name, slug: project.slug, repoUrl: project.repoUrl } : null}
      environments={environments}
      secrets={secrets}
      integrations={integrations}
      previewConnections={previewConnections}
      role={(session as { role?: string }).role ?? null}
    />
  );
}
