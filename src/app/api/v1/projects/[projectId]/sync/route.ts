import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey, verifyProjectAccess } from "@/lib/auth/api-key";
import { getIndexingQueue } from "@/lib/queue/queues";

// ============================================================
// POST /api/v1/projects/[projectId]/sync — Trigger re-indexing
// ============================================================

interface SyncBody {
  branch?: string;
  incremental?: boolean;
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

  let body: SyncBody = {};
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    // Empty body is ok
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { defaultBranch: true },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const branch = body.branch ?? project.defaultBranch;
  const isIncremental = body.incremental ?? false;

  const queue = getIndexingQueue();
  const job = await queue.add(
    `index-${projectId}-api`,
    {
      projectId,
      branch,
      isIncremental,
    },
    { jobId: `index-${projectId}-api-${Date.now()}` }
  );

  return NextResponse.json(
    {
      status: "queued",
      jobId: job.id,
      projectId,
      branch,
      incremental: isIncremental,
    },
    { status: 202 }
  );
}
