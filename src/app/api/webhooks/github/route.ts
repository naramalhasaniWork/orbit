import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getIndexingQueue } from "@/lib/queue/queues";
import { emitRunStarted } from "@/lib/websocket";
import { dispatchRunStarted } from "@/services/reporting/integrations/outbound-webhooks";
import { handleMention, ORBIT_MENTION_PATTERN } from "@/services/mention-handler";
import type { PRContext } from "@/services/mention-handler";
import { handleInstallationEvent } from "@/services/github-installation-sync";
import { resolveGitHubToken } from "@/lib/github/token";

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

  // Handle installation events (no repository context needed)
  if (event === "installation" || event === "installation_repositories") {
    const result = await handleInstallationEvent(event, payload);
    return NextResponse.json(result);
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

        await dispatchRunStarted(project.id, {
          runId: run.id,
          mode: run.mode,
          trigger: "push",
        });
      }

      return NextResponse.json({ status: "push_processed", branch });
    }

    case "pull_request": {
      const action = payload.action as string;
      const pr = payload.pull_request as {
        number: number;
        head: { ref: string; sha: string };
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
            commitSha: pr?.head?.sha,
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

        await dispatchRunStarted(project.id, {
          runId: run.id,
          mode: "targeted",
          trigger: "pr",
        });
      }

      return NextResponse.json({ status: "pr_processed", action });
    }

    case "issue_comment": {
      const action = payload.action as string;
      if (action !== "created") {
        return NextResponse.json({ status: "comment_ignored", action });
      }

      const comment = payload.comment as {
        id: number;
        body: string;
        user: { login: string; type: string };
      } | undefined;

      if (!comment || !ORBIT_MENTION_PATTERN.test(comment.body)) {
        return NextResponse.json({ status: "not_a_mention" });
      }

      // Ignore our own bot comments to prevent loops
      if (comment.user.type === "Bot") {
        return NextResponse.json({ status: "bot_comment_ignored" });
      }

      const issue = payload.issue as {
        number: number;
        pull_request?: { url: string };
      } | undefined;

      // Only handle PR comments (issues with a pull_request link)
      if (!issue?.pull_request) {
        return NextResponse.json({ status: "not_a_pr_comment" });
      }

      const repo = payload.repository as {
        html_url: string;
        owner: { login: string };
        name: string;
      };

      // Fetch PR details — use project token for private repo access
      const resolved = await resolveGitHubToken(project.id);
      const prHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (resolved) {
        prHeaders.Authorization = `Bearer ${resolved.token}`;
      }
      const prDetailsRes = await fetch(issue.pull_request.url, {
        headers: prHeaders,
      });

      let branch = "unknown";
      let commitSha = "";
      if (prDetailsRes.ok) {
        const prData = (await prDetailsRes.json()) as {
          head: { ref: string; sha: string };
        };
        branch = prData.head.ref;
        commitSha = prData.head.sha;
      }

      const ctx: PRContext = {
        owner: repo.owner.login,
        repo: repo.name,
        prNumber: issue.number,
        branch,
        commitSha,
        commentId: comment.id,
        commentBody: comment.body,
        commentAuthor: comment.user.login,
      };

      // Process mention asynchronously — respond to GitHub quickly
      handleMention(repo.html_url, ctx).catch((err) =>
        console.error("[webhook] Mention handler error:", err)
      );

      return NextResponse.json({ status: "mention_processing", prNumber: issue.number });
    }

    case "ping":
      return NextResponse.json({ status: "pong" });

    default:
      return NextResponse.json({ status: "ignored", event });
  }
}
