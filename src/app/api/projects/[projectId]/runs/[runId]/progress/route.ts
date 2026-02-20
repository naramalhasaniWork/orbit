import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId, runId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: session.workspaceId },
    select: { id: true },
  });

  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async (): Promise<boolean> => {
        const run = await prisma.testRun.findFirst({
          where: { id: runId, projectId },
          select: {
            status: true,
            totalTests: true,
            passed: true,
            failed: true,
            flaky: true,
            skipped: true,
            durationMs: true,
          },
        });

        if (!run) {
          send({ status: "not_found" });
          controller.close();
          return true;
        }

        const completed = run.passed + run.failed + run.flaky + run.skipped;

        if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
          send({
            status: run.status,
            totalTests: run.totalTests,
            passed: run.passed,
            failed: run.failed,
            flaky: run.flaky,
            durationMs: run.durationMs,
            completed,
          });
          controller.close();
          return true;
        }

        // Find the most recent test result for "current test" display
        const latestResult = await prisma.testResult.findFirst({
          where: { testRunId: runId },
          orderBy: { createdAt: "desc" },
          select: {
            testCase: { select: { name: true } },
            verdict: true,
          },
        });

        send({
          status: run.status,
          totalTests: run.totalTests,
          passed: run.passed,
          failed: run.failed,
          flaky: run.flaky,
          completed,
          currentTest: latestResult?.testCase?.name ?? null,
          lastVerdict: latestResult?.verdict ?? null,
        });

        return false;
      };

      // Poll every 2 seconds for up to 10 minutes
      for (let i = 0; i < 300; i++) {
        try {
          const done = await poll();
          if (done) return;
        } catch {
          send({ status: "error", error: "Failed to check run progress" });
          controller.close();
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      send({ status: "timeout" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
