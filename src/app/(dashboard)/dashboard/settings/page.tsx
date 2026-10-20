import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsClient } from "@/components/settings/settings-client";

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
      where: { projectId: project.id },
      select: { id: true, name: true, type: true, url: true, isDefault: true, defaultRunMode: true },
      orderBy: { createdAt: "asc" },
    });

    secrets = await prisma.secret.findMany({
      where: { projectId: project.id },
      select: { id: true, key: true, environmentId: true, createdAt: true, updatedAt: true },
      orderBy: { key: "asc" },
    });
  }

  const settings = workspace?.settings as Record<string, unknown> | undefined;
  const ghConfig = settings?.github as { connected: boolean; installationId?: string; repos?: string[] } | undefined;
  const lnConfig = settings?.linear as { connected: boolean; teamId?: string; teamName?: string; autoCreateIssues?: boolean } | undefined;
  const slConfig = settings?.slack as {
    connected: boolean;
    notifications?: { runCompleted: boolean; testFailed: boolean };
  } | undefined;

  // Load Railway integration config from DB
  const railwayIntegration = workspaceId
    ? await prisma.integrationConfig.findUnique({
        where: {
          integration_config_unique: {
            workspaceId,
            provider: "railway",
          },
        },
        select: { isEnabled: true, config: true },
      })
    : null;
  const rwConfig = railwayIntegration?.isEnabled
    ? {
        connected: true,
        ...(railwayIntegration.config as Record<string, unknown>),
      }
    : { connected: false };

  const integrations = {
    github: ghConfig ?? { connected: false },
    linear: lnConfig ?? { connected: false },
    slack: slConfig ?? { connected: false },
    railway: rwConfig as {
      connected: boolean;
      userName?: string;
      railwayProjectId?: string;
      railwayProjectName?: string;
      serviceCount?: number;
    },
  };

  return (
    <SettingsClient
      workspace={workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null}
      project={project ? { id: project.id, name: project.name, slug: project.slug, repoUrl: project.repoUrl } : null}
      environments={environments}
      secrets={secrets}
      integrations={integrations}
    />
  );
}
