import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProjectsListClient } from "@/components/projects/projects-list-client";

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          testRuns: true,
          testCases: true,
          systemMapNodes: true,
          systemMapEdges: true,
        },
      },
    },
  });

  return (
    <ProjectsListClient
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        repoUrl: p.repoUrl,
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        framework: p.framework,
        healthStatus: p.healthStatus,
        lastIndexedAt: p.lastIndexedAt?.toISOString() ?? null,
        lastRunAt: p.lastRunAt?.toISOString() ?? null,
        onboardingCompleted: p.onboardingCompleted,
        nodeCount: p._count.systemMapNodes,
        edgeCount: p._count.systemMapEdges,
        testCaseCount: p._count.testCases,
        testRunCount: p._count.testRuns,
      }))}
    />
  );
}
