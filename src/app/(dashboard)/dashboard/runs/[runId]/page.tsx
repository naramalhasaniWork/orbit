import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RunDetailClient } from "@/components/runs/run-detail-client";

interface RunDetailPageProps {
  params: Promise<{ runId: string }>;
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const workspaceId = (session as { workspaceId?: string }).workspaceId;
  if (!workspaceId) redirect("/login");

  const { runId } = await params;

  const project = await prisma.project.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!project) notFound();

  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId: project.id },
    include: {
      results: {
        include: {
          testCase: {
            select: {
              id: true,
              name: true,
              type: true,
              journey: true,
              priorityScore: true,
              isCritical: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) notFound();

  const serializedRun = {
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
    results: run.results.map((r) => ({
      id: r.id,
      verdict: r.verdict,
      durationMs: r.durationMs,
      retryCount: r.retryCount,
      steps: r.steps,
      failureExplanation: r.failureExplanation,
      suggestedFix: r.suggestedFix,
      artifacts: r.artifacts,
      healedSelectors: r.healedSelectors,
      testCase: r.testCase,
    })),
  };

  return <RunDetailClient run={serializedRun} projectId={project.id} />;
}
