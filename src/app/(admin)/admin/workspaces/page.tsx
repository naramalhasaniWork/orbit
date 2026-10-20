import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WorkspacesClient } from "@/components/admin/workspaces-client";

export default async function AdminWorkspacesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      _count: { select: { members: true, projects: true } },
      members: {
        where: { role: "owner" },
        take: 1,
        include: { user: { select: { name: true, email: true } } },
      },
      projects: {
        select: { _count: { select: { testRuns: true } } },
      },
    },
  });

  const data = workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    tier: ws.tier,
    creditBalance: ws.creditBalance,
    memberCount: ws._count.members,
    projectCount: ws._count.projects,
    runCount: ws.projects.reduce((sum, p) => sum + p._count.testRuns, 0),
    owner: ws.members[0]?.user ?? null,
    status: ws.deletedAt ? "deleted" : "active",
    createdAt: ws.createdAt.toISOString(),
  }));

  return (
    <WorkspacesClient
      workspaces={data}
      total={await prisma.workspace.count()}
    />
  );
}
