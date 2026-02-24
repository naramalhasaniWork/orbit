import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RunsClient } from "@/components/runs/runs-client";

export const dynamic = "force-dynamic";

export default async function RunsPage({
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
      <RunsClient projectId={null} projectName={null} initialRuns={[]} />
    );
  }

  const [runs, envCount, activePlan] = await Promise.all([
    prisma.testRun.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        mode: true,
        trigger: true,
        totalTests: true,
        passed: true,
        failed: true,
        flaky: true,
        skipped: true,
        durationMs: true,
        branch: true,
        commitSha: true,
        createdAt: true,
      },
    }),
    // Check for at least one non-production environment
    prisma.environment.count({
      where: { projectId: project.id, type: { not: "production" } },
    }),
    // Check for an active test plan
    prisma.testPlan.findFirst({
      where: { projectId: project.id, isActive: true },
      select: { id: true },
    }),
  ]);

  const serializedRuns = runs.map((run) => ({
    id: run.id,
    status: run.status,
    mode: run.mode,
    trigger: run.trigger,
    totalTests: run.totalTests,
    passed: run.passed,
    failed: run.failed,
    flaky: run.flaky,
    skipped: run.skipped,
    durationMs: run.durationMs,
    branch: run.branch,
    commitSha: run.commitSha,
    createdAt: run.createdAt,
  }));

  return (
    <RunsClient
      projectId={project.id}
      projectName={project.name}
      initialRuns={serializedRuns}
      hasEnvironment={envCount > 0}
      hasActivePlan={activePlan !== null}
    />
  );
}
