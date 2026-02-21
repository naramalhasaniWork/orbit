import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AuditDashboard } from "@/components/audit/audit-dashboard";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const params = await searchParams;

  let project: { id: string; name: string } | null = null;

  if (params.project) {
    project = await prisma.project.findFirst({
      where: { id: params.project, workspaceId },
      select: { id: true, name: true },
    });
  }

  if (!project) {
    project = await prisma.project.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-muted-foreground text-sm">
          Create a project first to run code audits.
        </p>
      </div>
    );
  }

  const audits = await prisma.auditResult.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      overallScore: true,
      issueCount: true,
      criticalCount: true,
      categories: true,
      metadata: true,
      createdAt: true,
    },
  });

  const serialized = audits.map((a) => ({
    id: a.id,
    overallScore: a.overallScore,
    issueCount: a.issueCount,
    criticalCount: a.criticalCount,
    categories: a.categories as Record<
      string,
      { score: number; issues: string[] }
    >,
    metadata: a.metadata as Record<string, unknown>,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <AuditDashboard
      projectId={project.id}
      projectName={project.name}
      audits={serialized}
    />
  );
}
