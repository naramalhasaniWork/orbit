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
  }> = [];

  let secrets: Array<{
    id: string;
    key: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  if (project) {
    environments = await prisma.environment.findMany({
      where: { projectId: project.id },
      select: { id: true, name: true, type: true, url: true, isDefault: true },
      orderBy: { createdAt: "asc" },
    });

    secrets = await prisma.secret.findMany({
      where: { projectId: project.id },
      select: { id: true, key: true, createdAt: true, updatedAt: true },
      orderBy: { key: "asc" },
    });
  }

  return (
    <SettingsClient
      workspace={workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null}
      project={project ? { id: project.id, name: project.name, slug: project.slug, repoUrl: project.repoUrl } : null}
      environments={environments}
      secrets={secrets}
    />
  );
}
