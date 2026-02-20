import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WorkspaceDetailClient } from "@/components/admin/workspace-detail-client";

interface PageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function AdminWorkspaceDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { workspaceId } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      projects: {
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { testRuns: true, testCases: true } },
        },
      },
    },
  });

  if (!workspace) notFound();

  const recentRuns = await prisma.testRun.findMany({
    where: {
      project: { workspaceId },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      project: { select: { name: true } },
    },
  });

  // Usage stats
  const totalRuns = await prisma.testRun.count({
    where: { project: { workspaceId } },
  });

  const totalCredits = await prisma.creditTransaction.aggregate({
    where: { workspaceId, type: "consumption" },
    _sum: { amount: true },
  });

  return (
    <WorkspaceDetailClient
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
        creditBalance: workspace.creditBalance,
        monthlyCredits: workspace.monthlyCredits,
        createdAt: workspace.createdAt.toISOString(),
      }}
      members={workspace.members.map((m) => ({
        id: m.id,
        role: m.role,
        user: {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          platformRole: m.user.role,
        },
      }))}
      projects={workspace.projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        framework: p.framework,
        status: p.status,
        healthStatus: p.healthStatus,
        runCount: p._count.testRuns,
        testCaseCount: p._count.testCases,
        lastRunAt: p.lastRunAt?.toISOString() ?? null,
      }))}
      recentRuns={recentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        projectName: r.project.name,
        totalTests: r.totalTests,
        passed: r.passed,
        failed: r.failed,
        createdAt: r.createdAt.toISOString(),
      }))}
      usageStats={{
        totalRuns,
        totalCreditsConsumed: Math.abs(totalCredits._sum.amount ?? 0),
      }}
    />
  );
}
