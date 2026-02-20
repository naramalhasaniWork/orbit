import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { getIndexingQueue } from "@/lib/queue/queues";
import { emitRunStarted } from "@/lib/websocket";

function verifySlackSignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string
): boolean {
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const expected =
    "v0=" + createHmac("sha256", signingSecret).update(baseString).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface SlackAction {
  action_id: string;
  value: string;
  type: string;
}

interface SlackInteractionPayload {
  type: string;
  actions: SlackAction[];
  user: { id: string; username: string };
  team: { id: string };
  channel: { id: string };
  response_url: string;
  message: {
    ts: string;
    blocks: unknown[];
  };
}

async function sendSlackResponse(
  responseUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function handleRerunAction(
  action: SlackAction,
  payload: SlackInteractionPayload
): Promise<void> {
  const runId = action.value;

  const originalRun = await prisma.testRun.findUnique({
    where: { id: runId },
    select: {
      projectId: true,
      mode: true,
      branch: true,
      project: { select: { defaultBranch: true } },
    },
  });

  if (!originalRun) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Original run not found.",
    });
    return;
  }

  const newRun = await prisma.testRun.create({
    data: {
      projectId: originalRun.projectId,
      status: "queued",
      mode: originalRun.mode,
      trigger: "manual",
      branch: originalRun.branch ?? originalRun.project.defaultBranch,
    },
  });

  const queue = getIndexingQueue();
  await queue.add(
    `index-${originalRun.projectId}-rerun`,
    {
      projectId: originalRun.projectId,
      branch: originalRun.branch ?? originalRun.project.defaultBranch,
      isIncremental: true,
    },
    { jobId: `index-${originalRun.projectId}-rerun-${Date.now()}` }
  );

  await emitRunStarted(newRun.id, {
    runId: newRun.id,
    projectId: originalRun.projectId,
    mode: originalRun.mode,
    trigger: "manual",
    totalTests: 0,
  });

  await sendSlackResponse(payload.response_url, {
    response_type: "in_channel",
    replace_original: false,
    text: `:arrows_counterclockwise: Re-run triggered by <@${payload.user.id}>. Run ID: \`${newRun.id}\``,
  });
}

async function handleMarkFlakyAction(
  action: SlackAction,
  payload: SlackInteractionPayload
): Promise<void> {
  const [testCaseId, projectId] = action.value.split("|");

  if (!testCaseId || !projectId) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Invalid action data.",
    });
    return;
  }

  await prisma.flakyTest.upsert({
    where: {
      flaky_test_unique: {
        projectId,
        testCaseId,
      },
    },
    update: {
      occurrences: { increment: 1 },
      lastFlakyAt: new Date(),
    },
    create: {
      projectId,
      testCaseId,
      occurrences: 1,
      isQuarantined: true,
    },
  });

  await sendSlackResponse(payload.response_url, {
    response_type: "in_channel",
    replace_original: false,
    text: `:label: Test marked as flaky and quarantined by <@${payload.user.id}>.`,
  });
}

async function handleCreateIssueAction(
  action: SlackAction,
  payload: SlackInteractionPayload
): Promise<void> {
  const [testResultId, projectId] = action.value.split("|");

  if (!testResultId || !projectId) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Invalid action data.",
    });
    return;
  }

  const result = await prisma.testResult.findUnique({
    where: { id: testResultId },
    include: { testCase: { select: { name: true } } },
  });

  if (!result) {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Test result not found.",
    });
    return;
  }

  const { createBugIssue } = await import(
    "@/services/reporting/integrations/linear"
  );

  const issueResult = await createBugIssue(
    {
      title: `Test Failure: ${result.testCase.name}`,
      description: result.failureExplanation ?? "Test failed during execution.",
      stepsToReproduce: ["Run the test suite", `Execute test: ${result.testCase.name}`],
      expectedBehavior: "Test should pass",
      actualBehavior: result.failureExplanation ?? "Test failed",
      severity: "medium",
      screenshotUrls: [],
      suggestedFix: result.suggestedFix ?? undefined,
    },
    projectId
  );

  if (issueResult.success) {
    await sendSlackResponse(payload.response_url, {
      response_type: "in_channel",
      replace_original: false,
      text: `:ticket: Linear issue created by <@${payload.user.id}>: <${issueResult.issueUrl}|${issueResult.issueId}>`,
    });
  } else {
    await sendSlackResponse(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: "Failed to create Linear issue. Check Linear integration settings.",
    });
  }
}

export async function POST(req: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  if (
    signingSecret &&
    !verifySlackSignature(body, timestamp, signature, signingSecret)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Slack sends interaction payloads as form-encoded with a "payload" field
  const params = new URLSearchParams(body);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return NextResponse.json({ status: "ignored" });
  }

  const action = payload.actions[0];

  switch (action.action_id) {
    case "orbit_rerun":
      await handleRerunAction(action, payload);
      break;

    case "orbit_mark_flaky":
      await handleMarkFlakyAction(action, payload);
      break;

    case "orbit_create_issue":
      await handleCreateIssueAction(action, payload);
      break;

    default:
      return NextResponse.json({ status: "unknown_action" });
  }

  // Return 200 immediately; responses are sent via response_url
  return NextResponse.json({ status: "ok" });
}
