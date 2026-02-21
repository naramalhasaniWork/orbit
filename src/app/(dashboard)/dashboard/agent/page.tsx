import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AgentPageClient } from "@/components/agent/agent-page-client";

export const dynamic = "force-dynamic";

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  if (!workspaceId) redirect("/login");

  const params = await searchParams;

  // Find the selected project or default to the first one
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, framework: true },
  });

  if (projects.length === 0) redirect("/dashboard/projects");

  const selectedId = params.project;
  const project =
    projects.find((p) => p.id === selectedId) ?? projects[0];

  return (
    <AgentPageClient
      projectId={project.id}
      projectName={project.name}
      framework={project.framework}
    />
  );
}
