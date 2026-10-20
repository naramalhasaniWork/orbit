import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth/api-key";
import { forWorkspace } from "@/server/data/scope";

// ============================================================
// GET /api/v1/projects/[projectId]/runs/[runId] — Get run details
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const { projectId, runId } = await params;

  const project = await forWorkspace(auth.workspaceId).findProject(projectId);
  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const run = await project.db.testRun.findUnique({
    where: { id: runId },
    include: {
      results: {
        select: {
          id: true,
          testCaseId: true,
          verdict: true,
          durationMs: true,
          retryCount: true,
          failureExplanation: true,
          suggestedFix: true,
          healedSelectors: true,
          createdAt: true,
          testCase: {
            select: { name: true, type: true, journey: true },
          },
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: run.id,
      projectId: run.projectId,
      status: run.status,
      mode: run.mode,
      trigger: run.trigger,
      branch: run.branch,
      commitSha: run.commitSha,
      prNumber: run.prNumber,
      totalTests: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      flaky: run.flaky,
      skipped: run.skipped,
      creditsConsumed: run.creditsConsumed,
      summary: run.summary,
      durationMs: run.durationMs,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      results: run.results.map((r) => ({
        id: r.id,
        testCaseId: r.testCaseId,
        testName: r.testCase.name,
        testType: r.testCase.type,
        journey: r.testCase.journey,
        verdict: r.verdict,
        durationMs: r.durationMs,
        retryCount: r.retryCount,
        failureExplanation: r.failureExplanation,
        suggestedFix: r.suggestedFix,
        healedSelectors: r.healedSelectors,
      })),
    },
  });
}
