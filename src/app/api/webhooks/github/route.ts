import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getIndexingQueue } from "@/lib/queue/queues";
import { emitRunStarted } from "@/lib/websocket";

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const event = req.headers.get("x-github-event");

  // Verify HMAC if webhook secret is configured
  if (webhookSecret && !verifySignature(body, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Find the project by repository URL
  const repoUrl = (payload.repository as { html_url?: string })?.html_url;
  if (!repoUrl) {
    return NextResponse.json({ error: "No repository URL" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { repoUrl },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found for this repository" }, { status: 404 });
  }

  // Log the webhook delivery
  await prisma.webhookDelivery.create({
    data: {
      projectId: project.id,
      event: event ?? "unknown",
      url: repoUrl,
      payload: payload as Record<string, string>,
    },
  });

  // Handle events
  switch (event) {
    case "push": {
      const ref = payload.ref as string | undefined;
      const branch = ref?.replace("refs/heads/", "") ?? "unknown";
      const commits = (payload.commits as Array<{ id: string; message: string }>) ?? [];

      // Only trigger on main/master branch pushes
      if (branch === "main" || branch === "master") {
        const changedFiles = commits.flatMap((c) => {
          const commit = c as unknown as {
            added?: string[];
            removed?: string[];
            modified?: string[];
          };
          return [
            ...(commit.added ?? []),
            ...(commit.removed ?? []),
            ...(commit.modified ?? []),
          ];
        });

        const run = await prisma.testRun.create({
          data: {
            projectId: project.id,
            status: "queued",
            mode: changedFiles.length > 20 ? "full" : "targeted",
            trigger: "push",
            branch,
            metadata: {
              commitCount: commits.length,
              changedFiles: changedFiles.slice(0, 100),
            } as Prisma.InputJsonValue,
          },
        });

        // Trigger indexing pipeline via BullMQ
        const queue = getIndexingQueue();
        await queue.add(
          `index-${project.id}-webhook`,
          {
            projectId: project.id,
            branch,
            changedFiles: changedFiles.slice(0, 100),
            isIncremental: changedFiles.length > 0 && changedFiles.length <= 20,
          },
          { jobId: `index-${project.id}-${Date.now()}` }
        );

        await emitRunStarted(run.id, {
          runId: run.id,
          projectId: project.id,
          mode: run.mode,
          trigger: "push",
          totalTests: 0,
        });
      }

      return NextResponse.json({ status: "push_processed", branch });
    }

    case "pull_request": {
      const action = payload.action as string;
      const pr = payload.pull_request as {
        number: number;
        head: { ref: string };
        title: string;
      } | undefined;

      if (action === "opened" || action === "synchronize") {
        const run = await prisma.testRun.create({
          data: {
            projectId: project.id,
            status: "queued",
            mode: "targeted",
            trigger: "pr",
            branch: pr?.head?.ref,
            prNumber: pr?.number,
            metadata: {
              prTitle: pr?.title ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        // Trigger indexing pipeline via BullMQ
        const queue = getIndexingQueue();
        await queue.add(
          `index-${project.id}-pr`,
          {
            projectId: project.id,
            branch: pr?.head?.ref ?? project.defaultBranch,
            isIncremental: false,
          },
          { jobId: `index-${project.id}-pr-${Date.now()}` }
        );

        await emitRunStarted(run.id, {
          runId: run.id,
          projectId: project.id,
          mode: "targeted",
          trigger: "pr",
          totalTests: 0,
        });
      }

      return NextResponse.json({ status: "pr_processed", action });
    }

    case "ping":
      return NextResponse.json({ status: "pong" });

    default:
      return NextResponse.json({ status: "ignored", event });
  }
}
