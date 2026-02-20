import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey, verifyProjectAccess } from "@/lib/auth/api-key";
import { getExecutionQueue } from "@/lib/queue/queues";
import { getDefaultEnvironment } from "@/services/execution/environment-validator";
import { emitRunStarted } from "@/lib/websocket";
import {
  dispatchRunStarted,
} from "@/services/reporting/integrations/outbound-webhooks";

// ============================================================
// POST /api/v1/projects/[projectId]/runs — Trigger a test run
// ============================================================

interface CreateRunBody {
  mode?: "full" | "smoke" | "regression" | "targeted";
  environment?: string;
  branch?: string;
  commitSha?: string;
  prNumber?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const { projectId } = await params;

  if (!(await verifyProjectAccess(auth.workspaceId, projectId))) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  let body: CreateRunBody = {};
  try {
    body = (await req.json()) as CreateRunBody;
  } catch {
    // Empty body is ok, defaults will be used
  }

  // Resolve environment
  let environmentId = body.environment;
  if (!environmentId) {
    environmentId = await getDefaultEnvironment(projectId) ?? undefined;
  }

  if (!environmentId) {
    return NextResponse.json(
      { error: "No environment configured" },
      { status: 400 }
    );
  }

  const environment = await prisma.environment.findFirst({
    where: { id: environmentId, projectId },
    select: { id: true, type: true, url: true },
  });

  if (!environment) {
    return NextResponse.json(
      { error: "Environment not found" },
      { status: 404 }
    );
  }

  if (environment.type === "production") {
    return NextResponse.json(
      { error: "Cannot run tests against production" },
      { status: 403 }
    );
  }

  const testPlan = await prisma.testPlan.findFirst({
    where: { projectId, isActive: true },
    select: { id: true },
    orderBy: { version: "desc" },
  });

  if (!testPlan) {
    return NextResponse.json(
      { error: "No active test plan. Index the repo first." },
      { status: 400 }
    );
  }

  const mode = body.mode ?? "regression";

  const run = await prisma.testRun.create({
    data: {
      projectId,
      environmentId: environment.id,
      testPlanId: testPlan.id,
      status: "queued",
      mode,
      trigger: "api",
      branch: body.branch,
      commitSha: body.commitSha,
      prNumber: body.prNumber,
    },
  });

  const testCases = await prisma.testCase.findMany({
    where: { testPlanId: testPlan.id, isEnabled: true },
    select: { id: true },
  });

  await prisma.testRun.update({
    where: { id: run.id },
    data: { totalTests: testCases.length, startedAt: new Date() },
  });

  const queue = getExecutionQueue();
  for (const tc of testCases) {
    await queue.add(`exec-${run.id}-${tc.id}`, {
      runId: run.id,
      testCaseId: tc.id,
      environmentUrl: environment.url,
      environmentId: environment.id,
    });
  }

  await emitRunStarted(run.id, {
    runId: run.id,
    projectId,
    mode,
    trigger: "api",
    totalTests: testCases.length,
  });

  await dispatchRunStarted(projectId, {
    runId: run.id,
    mode,
    trigger: "api",
  });

  return NextResponse.json(
    {
      id: run.id,
      projectId,
      status: "queued",
      mode,
      totalTests: testCases.length,
    },
    { status: 201 }
  );
}

// ============================================================
// GET /api/v1/projects/[projectId]/runs — List runs
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth instanceof NextResponse) return auth;

  const { projectId } = await params;

  if (!(await verifyProjectAccess(auth.workspaceId, projectId))) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const status = url.searchParams.get("status");

  const runs = await prisma.testRun.findMany({
    where: {
      projectId,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
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
      creditsConsumed: true,
      branch: true,
      commitSha: true,
      prNumber: true,
      durationMs: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: runs });
}
